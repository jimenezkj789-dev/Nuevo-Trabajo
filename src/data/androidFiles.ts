export interface AndroidFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const androidProjectFiles: AndroidFile[] = [
  {
    name: "LocationData.kt",
    path: "app/src/main/java/com/geosync/app/model/LocationData.kt",
    language: "kotlin",
    description: "Modelo de datos que representa las coordenadas geográficas y la marca de tiempo de sincronización.",
    content: `package com.geosync.app.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.PropertyName

/**
 * Representa la entidad de ubicación guardada y transmitida desde Firestore.
 * 
 * @property latitud Latitud geográfica en grados.
 * @property longitud Longitud geográfica en grados.
 * @property ciudad Ciudad actual de monitoreo ("Trujillo").
 * @property region Región actual ("La Libertad").
 * @property pais País de operación ("Perú").
 * @property timestamp Marca de tiempo provista por el servidor Firestore o sistema.
 */
data class LocationData(
    @get:PropertyName("latitud") @set:PropertyName("latitud")
    var latitud: Double = 0.0,
    
    @get:PropertyName("longitud") @set:PropertyName("longitud")
    var longitud: Double = 0.0,

    @get:PropertyName("ciudad") @set:PropertyName("ciudad")
    var ciudad: String = "Trujillo",

    @get:PropertyName("region") @set:PropertyName("region")
    var region: String = "La Libertad",

    @get:PropertyName("pais") @set:PropertyName("pais")
    var pais: String = "Perú",
    
    @get:PropertyName("timestamp") @set:PropertyName("timestamp")
    var timestamp: Timestamp? = null
) {
    // Constructor secundario conveniente para instanciación rápida
    constructor(latitud: Double, longitud: Double) : this(
        latitud = latitud,
        longitud = longitud,
        ciudad = "Trujillo",
        region = "La Libertad",
        pais = "Perú",
        timestamp = Timestamp.now()
    )
}`
  },
  {
    name: "LocationRepository.kt",
    path: "app/src/main/java/com/geosync/app/repository/LocationRepository.kt",
    language: "kotlin",
    description: "Interfaz del Repositorio que desacopla la fuente de datos (Firestore) del resto de la lógica de negocio.",
    content: `package com.geosync.app.repository

import com.geosync.app.model.LocationData
import kotlinx.coroutines.flow.Flow

/**
 * Interfaz que define las operaciones permitidas sobre Firestore.
 * Cumple con Clean Architecture desacoplando la capa de datos.
 */
interface LocationRepository {
    
    /**
     * Guarda o actualiza la ubicación del usuario actual de manera asíncrona.
     * Encola en la colección "ubicaciones".
     */
    suspend fun updateLocation(location: LocationData): Result<Unit>

    /**
     * Escucha en tiempo real la última ubicación disponible del dispositivo mediante un Flow reactivo.
     * Implementa internamente el Snapshot Listener de Firebase Firestore.
     */
    fun listenToLastLocation(): Flow<Result<LocationData>>
}`
  },
  {
    name: "FirestoreLocationRepository.kt",
    path: "app/src/main/java/com/geosync/app/repository/FirestoreLocationRepository.kt",
    language: "kotlin",
    description: "Implementación concreta del repositorio utilizando la SDK oficial de Firebase Firestore de manera desacoplada.",
    content: `package com.geosync.app.repository

import com.geosync.app.model.LocationData
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Implementación de LocationRepository encargada de interactuar con Firebase Firestore.
 * Toda la sintaxis e importaciones de Firestore quedan aisladas en esta clase.
 */
class FirestoreLocationRepository(
    private val firestore: FirebaseFirestore
) : LocationRepository {

    private val dbCollection = firestore.collection("ubicaciones")
    private val documentId = "usuario_simulado_id" // Un identificador estático para simular el trayecto único

    override suspend fun updateLocation(location: LocationData): Result<Unit> {
        return try {
            // Guardamos o sobreescribimos el documento único para simular el movimiento continuo en el mismo marcador
            dbCollection.document(documentId).set(location).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override fun listenToLastLocation(): Flow<Result<LocationData>> = callbackFlow {
        // Obtenemos el snapshot listener en tiempo real de Firestore para el documento en particular
        val listenerRegistration = dbCollection.document(documentId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Result.failure(error))
                    return@addSnapshotListener
                }

                if (snapshot != null && snapshot.exists()) {
                    try {
                        val location = snapshot.toObject(LocationData::class.java)
                        if (location != null) {
                            trySend(Result.success(location))
                        } else {
                            trySend(Result.failure(Exception("Error al parsear el objeto LocationData")))
                        }
                    } catch (e: Exception) {
                        trySend(Result.failure(e))
                    }
                } else {
                    trySend(Result.failure(Exception("El documento no existe aún en Firestore.")))
                }
            }

        // De vital importancia: Se cancela y remueve el listener cuando el Flow deja de recolectar
        awaitClose {
            listenerRegistration.remove()
        }
    }
}`
  },
  {
    name: "LocationViewModel.kt",
    path: "app/src/main/java/com/geosync/app/viewmodel/LocationViewModel.kt",
    language: "kotlin",
    description: "ViewModel de la pantalla que gestiona los estados del mapa, permisos, la generación de movimiento simulado y la sincronización.",
    content: `package com.geosync.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.geosync.app.model.LocationData
import com.geosync.app.repository.LocationRepository
import com.google.firebase.Timestamp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

/**
 * Define los diferentes estados de la pantalla de Geolocalización.
 */
data class UiState(
    val hasLocationPermission: Boolean = false,
    val isSimulatingMovement: Boolean = false,
    val localLocation: LocationData = LocationData(-8.1116, -79.0287), // Plaza de Armas de Trujillo por defecto
    val syncedLocation: LocationData? = null,
    val isSyncing: Boolean = false,
    val error: String? = null,
    val connectionStatus: String = "Desconectado"
)

/**
 * ViewModel responsable de orquestar el flujo MVVM.
 * Genera coordenadas simuladas, ordena al repositorio el almacenamiento, e interactúa con StateFlow.
 */
class LocationViewModel(
    private val repository: LocationRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private var simulationJob: Job? = null
    
    // Variables para controlar el trayecto dinámico en Trujillo, La Libertad
    private var currentLatitude = -8.1116
    private var currentLongitude = -79.0287
    private var angle = 0.0

    init {
        // Escuchamos activamente los cambios en Firebase Firestore desde el momento del arranque, en segundo plano
        observeFirestoreUpdates()
    }

    /**
     * Actualiza el estado de los permisos de ubicación una vez concedidos por la View.
     */
    fun onPermissionResult(isGranted: Boolean) {
        _uiState.update { it.copy(hasLocationPermission = isGranted) }
        if (isGranted && !_uiState.value.isSimulatingMovement) {
            startMovementSimulation()
        }
    }

    /**
     * Inicia el hilo de corrutina para generar saltos de ubicación suaves cada 3 segundos.
     */
    fun startMovementSimulation() {
        if (simulationJob != null) return // Evitar arrancar múltiples corrutinas simultáneas

        _uiState.update { it.copy(isSimulatingMovement = true, error = null) }
        
        simulationJob = viewModelScope.launch {
            while (true) {
                // Generar movimiento dinámico circular fluido para simular caminar o conducir
                angle += 0.05
                val latOffset = 0.0003 * sin(angle)
                val lonOffset = 0.0003 * cos(angle)
                
                currentLatitude += latOffset
                currentLongitude += lonOffset
                
                val newLocalLocation = LocationData(
                    latitud = currentLatitude,
                    longitud = currentLongitude,
                    timestamp = Timestamp.now()
                )

                // Actualizar UI local inmediatamente
                _uiState.update { it.copy(localLocation = newLocalLocation, isSyncing = true) }

                // Sincronizar inmediatamente con Firebase Firestore de forma asíncrona
                val result = repository.updateLocation(newLocalLocation)
                result.fold(
                    onSuccess = {
                        _uiState.update { it.copy(isSyncing = false, error = null) }
                    },
                    onFailure = { throwable ->
                        _uiState.update { 
                            it.copy(
                                isSyncing = false, 
                                error = "Sincronización fallida: \${throwable.localizedMessage}"
                            ) 
                        }
                    }
                )
                
                // Intervalo de 3 segundos estrictos requeridos por la consigna
                delay(3000)
            }
        }
    }

    /**
     * Detiene la simulación del movimiento dinámico.
     */
    fun stopMovementSimulation() {
        simulationJob?.cancel()
        simulationJob = null
        _uiState.update { it.copy(isSimulatingMovement = false) }
    }

    /**
     * Método reactivo que escucha en tiempo real el Snapshot Listener expuesto por el Repository.
     */
    private fun observeFirestoreUpdates() {
        viewModelScope.launch {
            repository.listenToLastLocation().collect { result ->
                result.fold(
                    onSuccess = { incomingLocation ->
                        _uiState.update { 
                            it.copy(
                                syncedLocation = incomingLocation,
                                connectionStatus = "Conectado a Firestore (Escuchando)",
                                error = null
                            ) 
                        }
                    },
                    onFailure = { throwable ->
                        _uiState.update { 
                            it.copy(
                                connectionStatus = "Error de Red/Permisos",
                                error = "Firestore Error: \${throwable.localizedMessage}"
                            ) 
                        }
                    }
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopMovementSimulation()
    }
}`
  },
  {
    name: "LocationScreen.kt",
    path: "app/src/main/java/com/geosync/app/ui/screen/LocationScreen.kt",
    language: "kotlin",
    description: "Pantalla Jetpack Compose con integración declarativa de Google Maps, manejo visual de permisos y estados de sincronización en tiempo real.",
    content: `package com.geosync.app.ui.screen

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geosync.app.viewmodel.LocationViewModel
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*

/**
 * Pantalla principal desarrollada en Jetpack Compose puro.
 * Desacoplada de lógicas de base de datos directa. Observa reactivamente al ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationScreen(
    viewModel: LocationViewModel,
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Configuración inicial de la cámara del mapa (Trujillo, Perú)
    val defaultLatLng = LatLng(-8.1116, -79.0287)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(defaultLatLng, 14.5f)
    }

    // Auto-centrado suave cuando la ubicación sincronizada en la nube cambia
    LaunchedEffect(uiState.syncedLocation) {
        uiState.syncedLocation?.let { synced ->
            val targetLatLng = LatLng(synced.latitud, synced.longitud)
            cameraPositionState.animate(
                update = com.google.android.gms.maps.CameraUpdateFactory.newLatLng(targetLatLng),
                durationMs = 1000
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("GeoSync Firestore MVVM", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { padding ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Evaluamos si el usuario ya aprobó los permisos obligatorios.
            if (!uiState.hasLocationPermission) {
                // Vista informativa elegante para el requerimiento de permisos
                PermissionRestrictedView(onRequestPermission)
            } else {
                // Google Map y controles interactivos
                Column(modifier = Modifier.fillMaxSize()) {
                    
                    // Tarjeta de estado en tiempo real (Firebase syncing metrics)
                    StatusDashboard(uiState)

                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        
                        // Componente Oficial de Google Maps Compose Library
                        GoogleMap(
                            modifier = Modifier.fillMaxSize(),
                            cameraPositionState = cameraPositionState,
                            uiSettings = MapUiSettings(zoomControlsEnabled = true)
                        ) {
                            // Mostrar marcador de ubicación local generada
                            Marker(
                                state = MarkerState(
                                    position = LatLng(uiState.localLocation.latitud, uiState.localLocation.longitud)
                                ),
                                title = "Ubicación Local Simulada",
                                snippet = "Última gen: \${uiState.localLocation.latitud.toString().take(8)}"
                            )

                            // Mostrar marcador de posición retransmitido de Firestore (Sincronizado)
                            uiState.syncedLocation?.let { synced ->
                                // Animación del marcador: En compose animamos el LatLng de manera lineal utilizando lerp
                                val animatedLat by animateFloatAsState(
                                    targetValue = synced.latitud.toFloat(),
                                    animationSpec = tween(durationMillis = 1000), // Movimiento suave de 1 seg
                                    label = "MovimientoLat"
                                )
                                val animatedLon by animateFloatAsState(
                                    targetValue = synced.longitud.toFloat(),
                                    animationSpec = tween(durationMillis = 1000),
                                    label = "MovimientoLon"
                                )

                                Marker(
                                    state = MarkerState(
                                        position = LatLng(animatedLat.toDouble(), animatedLon.toDouble())
                                    ),
                                    title = "Sincronizado con Firestore",
                                    snippet = "Nube: \${synced.latitud.toString().take(8)}"
                                )
                            }
                        }

                        // Botones de simulación flotantes
                        SimulationController(
                            isSimulating = uiState.isSimulatingMovement,
                            onToggle = {
                                if (uiState.isSimulatingMovement) {
                                    viewModel.stopMovementSimulation()
                                } else {
                                    viewModel.startMovementSimulation()
                                }
                            },
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun StatusDashboard(uiState: com.geosync.app.viewmodel.UiState) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Estado Firestore:",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp
                )
                Text(
                    text = uiState.connectionStatus,
                    color = if (uiState.connectionStatus.contains("Conectado")) Color(0xFF2E7D32) else Color(0xFFC62828),
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            }
            
            Spacer(modifier = Modifier.height(6.dp))
            
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Ciudad / Región:",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp
                )
                Text(
                    text = "Trujillo, La Libertad, Perú",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
            
            Spacer(modifier = Modifier.height(6.dp))
            
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = "Ubicación Local Real:", fontSize = 13.sp)
                Text(
                    text = "\${uiState.localLocation.latitud.toString().take(8)}, \${uiState.localLocation.longitud.toString().take(8)}",
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    fontSize = 13.sp
                )
            }

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = "Firestore Sync:", fontSize = 13.sp)
                Text(
                    text = uiState.syncedLocation?.let { "\${it.latitud.toString().take(8)}, \${it.longitud.toString().take(8)}" } ?: "Espere...",
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.secondary
                )
            }

            if (uiState.isSyncing) {
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                )
            }

            uiState.error?.let { err ->
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = err,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun PermissionRestrictedView(onRequestPermission: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = "Alerta",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(56.dp)
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = "Acceso a la Ubicación Requerido",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = "Esta aplicación requiere permisos de ubicación precisos y aproximados para simular el trayecto y sincronizar tu ruta con Firestore en tiempo real.",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 20.sp
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Button(
                    onClick = onRequestPermission,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Conceder Permisos", fontSize = 15.sp)
                }
            }
        }
    }
}

@Composable
fun SimulationController(
    isSimulating: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onToggle,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 6.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSimulating) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
        ),
        modifier = modifier
    ) {
        Text(
            text = if (isSimulating) "Detener Simulación" else "Iniciar Simulación",
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(vertical = 4.dp)
        )
    }
}`
  },
  {
    name: "MainActivity.kt",
    path: "app/src/main/java/com/geosync/app/MainActivity.kt",
    language: "kotlin",
    description: "Activity principal que inicializa Firebase, implementa la solicitud de permisos en tiempo de ejecución y lanza la composición de la pantalla.",
    content: `package com.geosync.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.geosync.app.repository.FirestoreLocationRepository
import com.geosync.app.ui.screen.LocationScreen
import com.geosync.app.ui.theme.GeoSyncTheme
import com.geosync.app.viewmodel.LocationViewModel
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore

/**
 * Actividad principal del proyecto Android.
 * Responsabilidad estricta de UI periférica y orquestación de permisos iniciales.
 */
class MainActivity : ComponentActivity() {

    private lateinit var viewModel: LocationViewModel

    // Launcher moderno para solicitud de múltiples permisos en tiempo de ejecución
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        
        if (fineGranted || coarseGranted) {
            viewModel.onPermissionResult(true)
            Toast.makeText(this, "Permisos de ubicación concedidos.", Toast.LENGTH_SHORT).show()
        } else {
            viewModel.onPermissionResult(false)
            Toast.makeText(
                this, 
                "Permisos denegados. Acceso limitado a la simulación geográfica.", 
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Inicialización de Firebase Applet SDK
        FirebaseApp.initializeApp(this)
        val firestore = FirebaseFirestore.getInstance()
        
        // Inicialización manual de dependencias cumpliendo Clean Architecture
        val repository = FirestoreLocationRepository(firestore)
        viewModel = LocationViewModel(repository)

        // Verificación proactiva de permisos existentes
        val hasFine = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        val hasCoarse = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        viewModel.onPermissionResult(hasFine || hasCoarse)

        setContent {
            GeoSyncTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    LocationScreen(
                        viewModel = viewModel,
                        onRequestPermission = { launchPermissionRequest() }
                    )
                }
            }
        }
    }

    /**
     * Dispara la petición interactiva exigiendo permisos ACCESS_FINE_LOCATION y ACCESS_COARSE_LOCATION.
     */
    private fun launchPermissionRequest() {
        requestPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }
}`
  },
  {
    name: "AndroidManifest.xml",
    path: "app/src/main/AndroidManifest.xml",
    language: "xml",
    description: "Archivo de manifiesto obligatoriamene configurado con los permisos requeridos por Google Maps, hardware y claves de la API.",
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.geosync.app">

    <!-- Permisos de Ubicación solicitados obligatoriamente -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    
    <!-- Permisos requeridos para la conectividad y sincronización con Firebase -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="GeoSync App"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.GeoSyncTheme">
        
        <!-- API KEY obligatoria para el funcionamiento de Google Maps SDK en Android -->
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="AQUI_VA_TU_GOOGLE_MAPS_API_KEY" />

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.GeoSyncTheme">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>`
  },
  {
    name: "build.gradle (App)",
    path: "app/build.gradle",
    language: "groovy",
    description: "Configuración a nivel de aplicación modular con Kotlin DSL o Groovy, incluyendo Compose, Maps y Firebase Firestore SDK.",
    content: `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'com.google.gms.google-services' // Plugin que conecta Firebase
}

android {
    compileSdk 34

    defaultConfig {
        applicationId "com.geosync.app"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary true
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = '17'
        freeCompilerArgs += ["-opt-in=kotlin.RequiresOptIn"]
    }
    buildFeatures {
        compose true
    }
    composeOptions {
        kotlinCompilerExtensionVersion '1.5.8'
    }
    packagingOptions {
        resources {
            excludes += '/META-INF/{AL2.0,LGPL2.1}'
        }
    }
}

dependencies {
    // AndroidX & Core KTX
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'
    implementation 'androidx.activity:activity-compose:1.8.2'

    // Jetpack Compose BOM
    implementation platform('androidx.compose:compose-bom:2024.01.00')
    implementation 'androidx.compose.ui:ui'
    implementation 'androidx.compose.ui:ui-graphics'
    implementation 'androidx.compose.ui:ui-tooling-preview'
    implementation 'androidx.compose.material3:material3'
    
    // Google Maps para Jetpack Compose
    implementation 'com.google.maps.android:maps-compose:4.3.0'
    implementation 'com.google.android.gms:play-services-maps:18.2.0'

    // Firebase (Bom para alineación segura de versiones)
    implementation platform('com.google.firebase:firebase-bom:32.7.1')
    implementation 'com.google.firebase:firebase-analytics-ktx'
    implementation 'com.google.firebase:firebase-firestore-ktx' // SDK Firestore

    // Corrutinas para flujo asíncrono
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3'

    // Testing
    testImplementation 'junit:junit:4.13.2'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
    androidTestImplementation platform('androidx.compose:compose-bom:2024.01.00')
    androidTestImplementation 'androidx.compose.ui:ui-test-junit4'
    debugImplementation 'androidx.compose.ui:ui-tooling'
    debugImplementation 'androidx.compose.ui:ui-test-manifest'
}`
  },
  {
    name: "build.gradle (Project)",
    path: "build.gradle",
    language: "groovy",
    description: "Configuración a nivel de raíz del proyecto declarando los plugins de Gradle de Google, Kotlin y servicios de Firebase.",
    content: `// Gradle raíz del proyecto para definir versiones de complementos globales
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'
        classpath 'com.google.gms:google-services:4.4.1' // Plugin de Firebase Cloud Services
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}`
  }
];
