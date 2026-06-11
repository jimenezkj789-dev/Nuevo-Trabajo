import { useState, useEffect, useRef, useMemo, MouseEvent } from "react";
import {
  Smartphone,
  MapPin,
  Files,
  Code2,
  Database,
  Play,
  Square,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  ArrowRight,
  Lock,
  RefreshCw,
  Copy,
  Download,
  Search,
  Wifi,
  WifiOff,
  Battery,
  Compass,
  Map,
  Code,
  Info
} from "lucide-react";
import { androidProjectFiles, AndroidFile } from "./data/androidFiles";
import { motion, AnimatePresence } from "motion/react";

// Types for Simulator
interface LocationLog {
  id: string;
  time: string;
  type: "success" | "warning" | "info" | "error";
  message: string;
}

// Landmark nodes to render on our custom Vector Map
interface MapLandmark {
  name: string;
  x: number;
  y: number;
  type: "plaza" | "building" | "park" | "metro";
}

const LANDMARKS: MapLandmark[] = [
  { name: "Catedral de Trujillo", x: 260, y: 195, type: "building" },
  { name: "Plaza de Armas de Trujillo", x: 260, y: 220, type: "plaza" },
  { name: "Municipalidad de Trujillo", x: 230, y: 240, type: "building" },
  { name: "Univ. Nacional de Trujillo (UNT)", x: 194, y: 196, type: "building" },
  { name: "Óvalo Papal", x: 165, y: 210, type: "plaza" },
  { name: "Mall Plaza Trujillo", x: 110, y: 120, type: "building" },
  { name: "Real Plaza Trujillo", x: 284, y: 344, type: "building" },
  { name: "Plazuela El Recreo", x: 310, y: 200, type: "plaza" },
  { name: "Óvalo Larco", x: 210, y: 320, type: "plaza" }
];

// Grid roads representing main avenues of Trujillo
const ROADS = [
  // Avenidas Principales (Main Streets)
  { name: "Avenida España (Anillo Vial)", y: 160, xS: 120, xE: 380, main: true },
  { name: "Avenida España (Lateral Sur)", y: 280, xS: 125, xE: 380, main: true },
  { name: "Avenida Larco", y: 270, xS: 50, xE: 450, main: true },
  { name: "Avenida América Sur", y: 340, xS: 0, xE: 500, main: true },
  { name: "Avenida América Oeste", y: 100, xS: 0, xE: 500, main: true },
  
  // Calles Secundarias (Cross/Secondary Streets)
  { name: "Jr. Pizarro", x: 245, yS: 140, yE: 300, main: false },
  { name: "Jr. Independencia", x: 275, yS: 140, yE: 300, main: false },
  { name: "Jr. Almagro", y: 220, xS: 180, xE: 350, main: false },
  { name: "Jr. Orbegoso", x: 215, yS: 140, yE: 300, main: false },
  { name: "Avenida Mansiche", x: 165, yS: 0, yE: 500, main: false },
  { name: "Avenida César Vallejo", x: 330, yS: 100, yE: 540, main: false }
];

export default function App() {
  // Mobile Simulator state variables
  const [permissionState, setPermissionState] = useState<string>("init"); // init, requesting, granted, denied, permanent_denied, settings
  const [coarsePermission, setCoarsePermission] = useState<boolean>(true);
  const [finePermission, setFinePermission] = useState<boolean>(true);

  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Geographic coordinates simulation: Center of Trujillo, Peru: -8.1116, -79.0287
  // We mirror geographic lat/lng to 2D Map (X/Y) coordinates (mapping center to the Plaza de Armas)
  const [lat, setLat] = useState<number>(-8.1116);
  const [lon, setLon] = useState<number>(-79.0287);
  
  // Last location that successfully synced with Firebase
  const [syncedLat, setSyncedLat] = useState<number | null>(null);
  const [syncedLon, setSyncedLon] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  // Map settings
  const [zoomLevel, setZoomLevel] = useState<number>(1.2);
  const [mapPan, setMapPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Simulation Trail (historical coordinates)
  const [trail, setTrail] = useState<{ lat: number; lon: number; x: number; y: number }[]>([]);

  // Logs stream
  const [logs, setLogs] = useState<LocationLog[]>([
    {
      id: "1",
      time: new Date().toLocaleTimeString(),
      type: "info",
      message: "Inicializando módulo de geolocalización Android FusedLocation..."
    },
    {
      id: "2",
      time: new Date().toLocaleTimeString(),
      type: "info",
      message: "Snapshot Listener inicializado en el repositorio (Escuchando 'ubicaciones/usuario_simulado_id')."
    }
  ]);

  // UI Code Explorer state variables
  const [selectedFile, setSelectedFile] = useState<AndroidFile>(androidProjectFiles[0]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Time reference
  const [mockClock, setMockClock] = useState<string>("09:30 AM");

  // Physics simulation angle for orbital trajectory
  const angleRef = useRef<number>(0);

  // Clock ticks
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setMockClock(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Filtered files based on search
  const filteredProjectFiles = useMemo(() => {
    if (!searchTerm) return androidProjectFiles;
    return androidProjectFiles.filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // Helper to add logs to console
  const addLog = (type: "success" | "warning" | "info" | "error", message: string) => {
    const newLog: LocationLog = {
      id: Math.random().toString(),
      time: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs(prev => [newLog, ...prev.slice(0, 30)]); // Keep last 30
  };

  // Real-world Trujillo GPS Waypoints route simulation
  const WAYPOINTS = useMemo(() => [
    { name: "Plaza de Armas de Trujillo", lat: -8.1116, lon: -79.0287, info: "Punto de inicio y centro histórico." },
    { name: "Universidad Nacional de Trujillo", lat: -8.1090, lon: -79.0360, info: "Frente a avenida Juan Pablo II y UNT." },
    { name: "Óvalo Papal", lat: -8.1105, lon: -79.0392, info: "Cruzando el Óvalo Papal..." },
    { name: "Mall Plaza Trujillo", lat: -8.0983, lon: -79.0495, info: "Monitoreo en zona norte comercial (Mall Plaza)." },
    { name: "Avenida España", lat: -8.1095, lon: -79.0230, info: "Circundando el anillo vial histórico de Trujillo." },
    { name: "Real Plaza Trujillo", lat: -8.1254, lon: -79.0260, info: "Sincronizando trayecto sur cerca de Real Plaza." }
  ], []);

  // Convert Lat/Lng to local SVG map coordinates (scale and offsets)
  // Trujillo center: -8.1116, -79.0287 -> mapped perfectly inside 500x500 map space
  const geoToMap = (latitude: number, longitude: number) => {
    const latM = -8.1116;
    const lonM = -79.0287;
    const scaleY = 9000; 
    const scaleX = 9000;

    const dy = (latitude - latM) * scaleY; // positive flows up
    const dx = (longitude - lonM) * scaleX; // positive flows right

    return {
      x: 260 + dx, // map center offset X
      y: 220 - dy  // map center offset Y (Y flows down in SVG)
    };
  };

  // Simulation loop trigger
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSimulating && permissionState === "granted") {
      addLog("info", "Iniciando Fused Location Provider. Muestreo cada 3 segundos.");
      
      interval = setInterval(() => {
        // Increment physics projection angle slowly for smooth waypoint transitions
        angleRef.current += 0.08;
        
        const totalWaypoints = WAYPOINTS.length;
        const currentStepDouble = angleRef.current;
        const currentIdx = Math.floor(currentStepDouble) % totalWaypoints;
        const nextIdx = (currentIdx + 1) % totalWaypoints;
        const fraction = currentStepDouble % 1;

        // Linear interpolation between consecutive realistic waypoints in Trujillo
        const nextLat = WAYPOINTS[currentIdx].lat + (WAYPOINTS[nextIdx].lat - WAYPOINTS[currentIdx].lat) * fraction;
        const nextLon = WAYPOINTS[currentIdx].lon + (WAYPOINTS[nextIdx].lon - WAYPOINTS[currentIdx].lon) * fraction;

        setLat(nextLat);
        setLon(nextLon);

        const mapPos = geoToMap(nextLat, nextLon);

        // Record locally generated location
        addLog("info", `Gps Loc [Trujillo]: ${nextLat.toFixed(6)}, ${nextLon.toFixed(6)} (${WAYPOINTS[currentIdx].name})`);

        // Trigger Sync action to Firebase (simulating 400ms network round-trip)
        if (isOffline) {
          addLog("error", "Error Firestore: El cliente no tiene conexión. Guardado en caché.");
        } else {
          setIsSyncing(true);
          setTimeout(() => {
            setIsSyncing(false);
            setSyncedLat(nextLat);
            setSyncedLon(nextLon);
            setLastSyncTime(new Date().toLocaleTimeString());
            
            // Append to trail
            setTrail(prev => {
              const currentTrail = [...prev, { lat: nextLat, lon: nextLon, x: mapPos.x, y: mapPos.y }];
              if (currentTrail.length > 20) currentTrail.shift(); // keep trail length in check
              return currentTrail;
            });

            addLog("success", `Firestore Sincronizado: Documento 'usuario_simulado_id' actualizado con éxito.`);
          }, 350);
        }
      }, 3000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
        addLog("warning", "Simulación Fused Location pausada.");
      }
    };
  }, [isSimulating, permissionState, isOffline, WAYPOINTS]);

  // Request Permissions Flow
  const launchPermissionsRequest = () => {
    setPermissionState("requesting");
  };

  const handlePermissionsConfirmation = (granted: boolean) => {
    if (granted) {
      if (finePermission || coarsePermission) {
        setPermissionState("granted");
        addLog("success", `Permisos de ubicación habilitados (${finePermission ? "FINE" : ""}${finePermission && coarsePermission ? " y " : ""}${coarsePermission ? "COARSE" : ""}).`);
        setIsSimulating(true); // Auto-starts simulation like a professional app
      } else {
        setPermissionState("denied");
        addLog("warning", "Permisos denegados por completo.");
      }
    } else {
      setPermissionState("denied");
      addLog("warning", "El usuario rechazó los permisos de ubicación.");
    }
  };

  const handleDenyPermanently = () => {
    setPermissionState("permanent_denied");
    addLog("error", "Permisos denegados permanentemente. Solicitar navegación manual a Configuración.");
  };

  // Reset full state
  const resetSimulation = () => {
    setLat(-8.1116);
    setLon(-79.0287);
    setSyncedLat(null);
    setSyncedLon(null);
    setTrail([]);
    setIsSimulating(false);
    setPermissionState("init");
    addLog("info", "Módulo restablecido. Esperando permisos de usuario.");
  };

  // Simulate manual map click jump coord
  const handleMapClick = (e: MouseEvent<SVGSVGElement>) => {
    if (permissionState !== "granted") return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    
    // Calculate click coordinates within the 500x500 map space
    const clickX = ((e.clientX - rect.left) / rect.width) * 500;
    const clickY = ((e.clientY - rect.top) / rect.height) * 500;

    // Convert map X/Y back to approximated Lat/Lng in Trujillo
    const scaleY = 9000;
    const scaleX = 9000;
    const latM = -8.1116;
    const lonM = -79.0287;

    const clickLon = lonM + (clickX - 260) / scaleX;
    const clickLat = latM - (clickY - 220) / scaleY;

    // Trigger instant location jump
    setLat(clickLat);
    setLon(clickLon);
    addLog("info", `Salto manual provocado: ${clickLat.toFixed(6)}, ${clickLon.toFixed(6)}`);

    if (isOffline) {
      addLog("error", "Imposible actualizar Firestore en vivo: Dispositivo Sin Conexión.");
    } else {
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        setSyncedLat(clickLat);
        setSyncedLon(clickLon);
        setLastSyncTime(new Date().toLocaleTimeString());
        
        // Append to trail
        setTrail(prev => {
          const currentTrail = [...prev, { lat: clickLat, lon: clickLon, x: clickX, y: clickY }];
          if (currentTrail.length > 20) currentTrail.shift();
          return currentTrail;
        });
        addLog("success", `Snapshot Listener: actualización reactiva recibida desde Firebase Firestore.`);
      }, 300);
    }
  };

  // Code copier logic
  const handleCopyCode = (code: string, fileName: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFile(fileName);
    setTimeout(() => setCopiedFile(null), 2500);
    addLog("success", `Código copiado al portapapeles: ${fileName}`);
  };

  // Download ZIP simulation info
  const triggerBulkDownloadAlert = () => {
    addLog("success", "Generando paquete ZIP para descarga local de la arquitectura Android.");
    const note = `/*
  Paso a paso para integrar este código exportado en Android Studio:
  1. Copia los archivos Kotlin (.kt) en tu estructura com.geosync.app
  2. Sustituye build.gradle gubernamentales en su respectivo nivel
  3. Inserta tu API Key de Google Maps en AndroidManifest.xml
*/`;
    const element = document.createElement("a");
    const combinedContent = note + "\n\n" + androidProjectFiles.map(f => `// ================== ${f.name} ==================\n// Path: ${f.path}\n\n${f.content}`).join("\n\n");
    const file = new Blob([combinedContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "GeoSync_Android_Clean_Architecture_Kotlin.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Dynamic values mapping for the Map UI representation
  const localMapPos = geoToMap(lat, lon);
  const syncedMapPos = syncedLat && syncedLon ? geoToMap(syncedLat, syncedLon) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Professional Banner Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-semibold tracking-widest text-emerald-400 uppercase">
                Enterprise MVP Sandbox
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Android Geolocation & Firestore MVVM Suite
            </h1>
            <p className="text-sm text-slate-400 max-w-xl mt-0.5">
              Simulador interactivo y explorador modular de código Kotlin con arquitectura MVVM limpia y retransmisión de datos por Firestore.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOffline(!isOffline)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide border transition-all ${
                isOffline
                  ? "bg-rose-950/40 text-rose-300 border-rose-800 hover:bg-rose-950/60"
                  : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800"
              }`}
            >
              {isOffline ? <WifiOff className="h-3.5 w-3.5 text-rose-400" /> : <Wifi className="h-3.5 w-3.5 text-emerald-400" />}
              {isOffline ? "Forzar Offline" : "En Línea (Cloud Sync)"}
            </button>
            <button
              onClick={triggerBulkDownloadAlert}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-900/40 transition-all border border-indigo-500/30"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar Proyecto (.kt/.xml)
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Structure */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Mobile Simulator App & Firestore Workspace (5 Columns) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Card Title Holder */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-indigo-400" />
                <h2 className="font-bold text-slate-100 text-sm tracking-wide">
                  Dispositivo Android de Prueba
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                Kotlin Compose VM
              </span>
            </div>

            {/* Smart Phone Case Wrapper */}
            <div className="relative w-[310px] h-[610px] bg-slate-950 border-4 border-slate-700 rounded-[44px] shadow-2xl overflow-hidden ring-12 ring-slate-800/40 flex flex-col">
              
              {/* Phone Speaker & Camera Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 border border-slate-800 rounded-full z-50 flex items-center justify-center">
                <div className="w-10 h-1 bg-slate-80s0/80 rounded-full" />
                <div className="w-2.5 h-2.5 bg-indigo-950 rounded-full ml-3 border border-slate-700/60" />
              </div>

              {/* Status Bar */}
              <div className="h-8 bg-slate-950/90 flex items-center justify-between px-6 text-[10px] font-mono text-slate-400 z-40 border-b border-slate-900 select-none">
                <span className="font-semibold text-slate-300 mt-1">{mockClock}</span>
                <div className="flex items-center gap-1.5 mt-1">
                  {isOffline ? (
                    <WifiOff className="h-3 w-3 text-rose-500" />
                  ) : (
                    <span className="text-emerald-400">● Live LTE</span>
                  )}
                  <Battery className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              {/* Main Inside Phone Screen Viewport */}
              <div className="flex-1 bg-slate-900 flex flex-col relative w-full overflow-hidden select-none">
                
                <AnimatePresence mode="wait">
                  {/* STEP 1: INITIAL PERMISSIONS EXPLANATORY PAGE */}
                  {permissionState === "init" && (
                    <motion.div
                      key="permission-init"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col justify-between p-6 bg-slate-950 z-30"
                    >
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
                        <div className="h-16 w-16 bg-indigo-950/80 border border-indigo-800/50 rounded-2xl flex items-center justify-center shadow-lg mb-6">
                          <Compass className="h-8 w-8 text-indigo-400 animate-pulse" />
                        </div>
                        <h3 className="text-white font-bold text-lg leading-snug">
                          Acceso a la Ubicación Requerido
                        </h3>
                        <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                          La aplicación <strong className="text-slate-200">GeoSync MVVM</strong> necesita permisos de localización de hardware para simular dinámicas del trayecto físico y persistirlo en Firestore en tiempo de compilación.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={launchPermissionsRequest}
                          className="w-full py-3 bg-indigo-600 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all border border-indigo-500/20"
                        >
                          Conceder Permisos
                        </button>
                        <p className="text-[10px] text-slate-500 text-center leading-normal">
                          Se solicitarán permisos <span className="font-mono">ACCESS_FINE_LOCATION</span> de manera asíncrona.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 2: NATIVE ANDROID SIMULATED DIALOG POPUP */}
                  {permissionState === "requesting" && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-end p-4">
                      <motion.div
                        initial={{ y: 150, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="h-4.5 w-4.5 text-indigo-400" />
                          <span className="text-[11px] font-bold text-slate-100 uppercase tracking-widest font-mono">
                            Android API Level 34
                          </span>
                        </div>
                        
                        <p className="text-slate-200 text-sm font-semibold leading-snug">
                          ¿Permitir que GeoSync acceda a la ubicación de este dispositivo?
                        </p>

                        {/* Location quality toggle checkboxes (Coarse vs Fine visualization) */}
                        <div className="grid grid-cols-2 gap-3 my-4">
                          <button
                            onClick={() => setCoarsePermission(!coarsePermission)}
                            className={`p-3 rounded-2xl border text-left transition-all ${
                              coarsePermission
                                ? "bg-indigo-950/40 border-indigo-500 text-slate-100"
                                : "bg-slate-950 border-slate-800 text-slate-500"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-bold">Aproximada</span>
                              <input type="checkbox" checked={coarsePermission} readOnly className="h-3 w-3 accent-indigo-500" />
                            </div>
                            <span className="text-[9px] text-slate-400 block mt-1.5 leading-tight">
                              Usa triangulación celular y redes Wi-Fi.
                            </span>
                          </button>

                          <button
                            onClick={() => setFinePermission(!finePermission)}
                            className={`p-3 rounded-2xl border text-left transition-all ${
                              finePermission
                                ? "bg-indigo-950/40 border-indigo-500 text-slate-100"
                                : "bg-slate-950 border-slate-800 text-slate-500"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-bold">Precisa</span>
                              <input type="checkbox" checked={finePermission} readOnly className="h-3 w-3 accent-indigo-500" />
                            </div>
                            <span className="text-[9px] text-slate-400 block mt-1.5 leading-tight">
                              Usa receptores satelitales GPS directos.
                            </span>
                          </button>
                        </div>

                        {/* Android Standard Permission CTA Buttons */}
                        <div className="space-y-1.5 mt-1">
                          <button
                            onClick={() => handlePermissionsConfirmation(true)}
                            className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-indigo-400 rounded-xl text-xs font-bold transition-all border border-slate-800"
                          >
                            Mientras la app está en uso
                          </button>
                          <button
                            onClick={() => handlePermissionsConfirmation(true)}
                            className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-indigo-400 rounded-xl text-xs font-bold transition-all border border-slate-800"
                          >
                            Solo esta vez
                          </button>
                          <button
                            onClick={() => handlePermissionsConfirmation(false)}
                            className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-rose-400 rounded-xl text-xs font-bold transition-all border border-slate-800"
                          >
                            Denegar
                          </button>
                          <button
                            onClick={handleDenyPermanently}
                            className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-medium transition-all"
                          >
                            Denegar permanentemente (No preguntar más)
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}

                  {/* STEP 3: MOCK MOUNTED APP - MAP & MOVEMENT INTERACTIVE ENVIRONMENT */}
                  {permissionState === "granted" && (
                    <motion.div
                      key="active-map"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex flex-col"
                    >
                      {/* Top App bar inside simulator */}
                      <div className="bg-indigo-900 border-b border-indigo-950 px-4 py-2.5 flex justify-between items-center select-none shadow-md">
                        <div className="flex items-center gap-1.5">
                          <Compass className="h-4 w-4 text-white animate-spin-slow" />
                          <span className="text-[11px] font-bold text-white tracking-wide">
                            GeoSync Firestore
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSyncing ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          )}
                          <span className="text-[9px] font-mono font-medium text-indigo-200">
                            {isSyncing ? "Syncing..." : isOffline ? "Offline" : "Live"}
                          </span>
                        </div>
                      </div>

                      {/* Trujillo Current Location Label Bar */}
                      <div className="bg-slate-950 px-3.5 py-2 border-b border-indigo-950/55 flex items-center justify-between text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5 select-none font-semibold">
                          <MapPin className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                          <span>Trujillo, La Libertad, Perú</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold tracking-wide uppercase ${
                          isOffline 
                            ? "bg-rose-950/80 text-rose-300 border border-rose-800/40" 
                            : "bg-emerald-950/80 text-emerald-300 border border-emerald-800/40"
                        }`}>
                          {isOffline ? "OFFLINE" : "FIREBASE OK"}
                        </span>
                      </div>

                      {/* Small Live Stats Hub */}
                      <div className="bg-slate-900 px-3.5 py-2.5 border-b border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-300">
                        <div>
                          <div className="flex items-center gap-1 text-slate-400 text-[9px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            GPS Local (Muestreo)
                          </div>
                          <div className="font-semibold text-slate-100">{lat.toFixed(6)}, {lon.toFixed(6)}</div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 text-emerald-400 text-[9px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Firestore Snapshot
                          </div>
                          <div className="font-semibold text-emerald-400">
                            {syncedLat ? `${syncedLat.toFixed(6)}, ${syncedLon?.toFixed(6)}` : "Esperando..."}
                          </div>
                        </div>
                      </div>

                      {/* THE INTERACTIVE MAP AREA (SVG) */}
                      <div className="flex-1 bg-slate-950 relative overflow-hidden group cursor-crosshair">
                        
                        {/* Map Scale indicator & control HUD */}
                        <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded-md text-[8px] font-mono text-slate-400 z-20">
                          TRUJILLO / PERÚ - Escala 1:12m
                        </div>

                        {/* Interactive HUD - Manual Jump Info */}
                        <div className="absolute bottom-3 left-3 right-3 bg-slate-900/95 border border-slate-805/90 p-2 rounded-xl text-[8.5px] text-slate-400 z-20 shadow-lg text-center leading-normal">
                          💡 <strong className="text-slate-200">Interactivo:</strong> Haz clic en cualquier calle del mapa para forzar la reubicación asíncrona.
                        </div>

                        <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
                          <button
                            onClick={() => setZoomLevel(z => Math.min(z + 0.15, 2.5))}
                            className="h-6 w-6 rounded bg-slate-800 border border-slate-700 text-slate-200 active:bg-slate-700 flex items-center justify-center font-bold text-xs shadow"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setZoomLevel(z => Math.max(z - 0.15, 0.75))}
                            className="h-6 w-6 rounded bg-slate-800 border border-slate-700 text-slate-200 active:bg-slate-700 flex items-center justify-center font-bold text-xs shadow"
                          >
                            -
                          </button>
                        </div>

                        {/* Map Canvas - Renders customizable roads and markers */}
                        <svg
                          width="100%"
                          height="100%"
                          viewBox="0 0 500 500"
                          onClick={handleMapClick}
                          className="w-full h-full transform transition-all duration-300"
                          style={{
                            transform: `scale(${zoomLevel}) translate(${mapPan.x}px, ${mapPan.y}px)`,
                            transformOrigin: "center center"
                          }}
                        >
                          {/* Map Background grid */}
                          <rect width="500" height="500" fill="#0B132B" />
                          <g stroke="#1C2541" strokeWidth="0.8">
                            {Array.from({ length: 25 }).map((_, i) => (
                              <line key={`lh-${i}`} x1="0" y1={i * 20} x2="500" y2={i * 20} />
                            ))}
                            {Array.from({ length: 25 }).map((_, i) => (
                              <line key={`lv-${i}`} x1={i * 20} y1="0" x2={i * 20} y2="500" />
                            ))}
                          </g>

                          {/* Roads / Streets layer */}
                          {ROADS.map((road, idx) => {
                            const isHoriz = 'y' in road;
                            return (
                              <g key={`road-${idx}`}>
                                <line
                                  x1={isHoriz ? (road as any).xS : (road as any).x}
                                  y1={isHoriz ? (road as any).y : (road as any).yS}
                                  x2={isHoriz ? (road as any).xE : (road as any).x}
                                  y2={isHoriz ? (road as any).y : (road as any).yE}
                                  stroke={road.main ? "#3A506B" : "#1C2541"}
                                  strokeWidth={road.main ? "10" : "6"}
                                  strokeLinecap="round"
                                />
                                {/* Overlay dashed lane lines */}
                                <line
                                  x1={isHoriz ? (road as any).xS : (road as any).x}
                                  y1={isHoriz ? (road as any).y : (road as any).yS}
                                  x2={isHoriz ? (road as any).xE : (road as any).x}
                                  y2={isHoriz ? (road as any).y : (road as any).yE}
                                  stroke="#222B45"
                                  strokeWidth={road.main ? "1.5" : "1"}
                                  strokeDasharray="4, 4"
                                />
                              </g>
                            );
                          })}

                          {/* Render Landmark zones */}
                          {LANDMARKS.map((landmark, idx) => (
                            <g key={`landmark-${idx}`} className="opacity-95 select-none pointer-events-none">
                              {landmark.type === "park" ? (
                                <rect
                                  x={landmark.x - 30}
                                  y={landmark.y - 20}
                                  width="90"
                                  height="50"
                                  rx="8"
                                  fill="#1B4D3E"
                                  className="fill-emerald-950/40 stroke-emerald-800/40"
                                  strokeWidth="1.5"
                                />
                              ) : landmark.type === "plaza" ? (
                                <rect
                                  x={landmark.x - 25}
                                  y={landmark.y - 15}
                                  width="50"
                                  height="30"
                                  rx="4"
                                  fill="#2D3142"
                                  className="fill-slate-800/60 stroke-slate-700/60"
                                  strokeWidth="1"
                                />
                              ) : (
                                <circle
                                  cx={landmark.x}
                                  cy={landmark.y}
                                  r="13"
                                  className="fill-slate-900 border stroke-indigo-500/20"
                                />
                              )}
                              <text
                                x={landmark.x}
                                y={landmark.y + (landmark.type === "park" ? 6 : landmark.type === "plaza" ? 5 : 20)}
                                fill="#8492A6"
                                fontSize="7"
                                fontFamily="sans-serif"
                                textAnchor="middle"
                                className="font-semibold"
                              >
                                {landmark.name}
                              </text>
                            </g>
                          ))}

                          {/* Historical Path Trail Sincronizada line */}
                          {trail.length > 1 && (
                            <path
                              d={`M ${trail.map(t => `${t.x} ${t.y}`).join(" L ")}`}
                              fill="none"
                              stroke="#10B981"
                              strokeWidth="2.5"
                              strokeDasharray="6,4"
                              strokeLinecap="round"
                              opacity="0.8"
                              className="transition-all duration-300"
                            />
                          )}

                          {/* LOCAL GENERATED BLUE DOT (FUSED LOCATION PROVIDER OUTPUT) */}
                          <g className="transition-all duration-300">
                            {/* Outer breathing locator halo */}
                            <circle
                              cx={localMapPos.x}
                              cy={localMapPos.y}
                              r="15"
                              fill="rgba(59, 130, 246, 0.25)"
                              className="animate-ping"
                              style={{ animationDuration: "2s" }}
                            />
                            <circle
                              cx={localMapPos.x}
                              cy={localMapPos.y}
                              r="7"
                              fill="#3B82F6"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                            />
                          </g>

                          {/* REMOTE SYNCHRONIZED GREEN DOT (FIRESTORE RETREIVED POSITION) */}
                          {syncedMapPos && (
                            <g className="transition-all duration-1000 ease-out">
                              <circle
                                cx={syncedMapPos.x}
                                cy={syncedMapPos.y}
                                r="18"
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="1"
                                opacity="0.6"
                              />
                              <circle
                                cx={syncedMapPos.x}
                                cy={syncedMapPos.y}
                                r="5.5"
                                fill="#10B981"
                                stroke="#ffffff"
                                strokeWidth="1.5"
                                className="drop-shadow-lg"
                              />
                            </g>
                          )}
                        </svg>
                      </div>

                      {/* Bottom action controls panel inside device */}
                      <div className="bg-slate-950 p-4 border-t border-slate-800 flex flex-col gap-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIsSimulating(!isSimulating)}
                            className={`flex-1 py-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow transition-all ${
                              isSimulating
                                ? "bg-amber-600 hover:bg-amber-500 text-white"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                            }`}
                          >
                            {isSimulating ? (
                              <>
                                <Square className="h-3.5 w-3.5" /> Pausar GPS
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 fill-current" /> Iniciar GPS Sim
                              </>
                            )}
                          </button>

                          <button
                            onClick={resetSimulation}
                            className="bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-3 rounded-xl text-slate-300 transition-all flex items-center justify-center"
                            title="Restablecer"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Informative micro note on permission isolation */}
                        <div className="flex items-start gap-1 pb-1">
                          <Info className="h-3 w-3 text-slate-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[8.5px] leading-snug text-slate-500">
                            La animación suave del marcador verde interpolará diferencias de latitud para simular la retransmisión por Snapshot Listener de Firestore de manera reactiva.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 4: DENIED ACCESSIBILITY STATE */}
                  {permissionState === "denied" && (
                    <motion.div
                      key="permission-denied"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-slate-950 p-6 flex flex-col justify-between text-center z-40"
                    >
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <AlertTriangle className="h-14 w-14 text-amber-500 mb-5" />
                        <h3 className="text-white font-bold text-lg leading-snug">
                          Permisos Denegados
                        </h3>
                        <p className="text-slate-400 text-xs mt-3 leading-relaxed px-1">
                          El usuario ha rechazado la solicitud de geolocalización. El mapa interactivo permanecerá congelado dado que Fused Location Provider no puede operar legítimamente sin permisos de hardware.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <button
                          onClick={launchPermissionsRequest}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md"
                        >
                          Solicitar Permiso de Nuevo
                        </button>
                        <button
                          onClick={() => setPermissionState("granted")}
                          className="w-full py-2.5 bg-slate-900 border border-slate-800 text-indigo-400 font-semibold text-xs rounded-xl"
                        >
                          Omitir Requerimiento (Bypass)
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 5: PERMANENTLY DENIED EDGE CASE */}
                  {permissionState === "permanent_denied" && (
                    <motion.div
                      key="permanent-denied"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-slate-950 p-6 flex flex-col justify-between z-40"
                    >
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <Lock className="h-12 w-12 text-rose-500 mb-5" />
                        <h4 className="text-white font-bold text-base leading-snug">
                          Acceso Bloqueado por Sistema
                        </h4>
                        <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                          Has marcado "No preguntar más" o bloqueado de forma permanente. Android inhabilita futuros popups informativos de la API para proteger al usuario. Debes habilitarlo desde las configuraciones del sistema del celular.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <button
                          onClick={() => setPermissionState("settings")}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow"
                        >
                          Ir a Ajustes de la Aplicación
                        </button>
                        <button
                          onClick={resetSimulation}
                          className="w-full py-2 text-slate-500 hover:text-slate-400 text-xs font-semibold"
                        >
                          Recomenzar desde cero
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 6: MOCK ANDROID SYSTEM SETTINGS VIEW */}
                  {permissionState === "settings" && (
                    <motion.div
                      key="android-settings"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-slate-900 flex flex-col z-40 text-slate-200"
                    >
                      <div className="bg-slate-950 px-4 py-3.5 border-b border-slate-800 flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-indigo-400" />
                        <span className="text-xs font-bold text-white">Configuración › Apps › GeoSync</span>
                      </div>

                      <div className="p-4 space-y-4 flex-1">
                        <div>
                          <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                            Permisos del Dispositivo
                          </h5>
                          <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 mt-2 flex justify-between items-center">
                            <div>
                              <div className="text-xs font-bold text-white">Ubicación física</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">Permitir solo si la app está en uso</div>
                            </div>
                            <button
                              onClick={() => {
                                setPermissionState("granted");
                                addLog("success", "Permisos activados manualmente desde los Ajustes del Celular.");
                              }}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg"
                            >
                              Habilitar No-Bloq
                            </button>
                          </div>
                        </div>

                        <div className="text-slate-400 text-[10px] leading-relaxed">
                          La aplicación no se cerrará ni capturará excepciones catastróficas. Al regresar a la App, el Fused Location Provider reasumirá su ejecución de manera asíncrona mediante el ViewModel.
                        </div>
                      </div>

                      <div className="p-4 border-t border-slate-800 bg-slate-950">
                        <button
                          onClick={() => setPermissionState("init")}
                          className="w-full py-2.5 bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold rounded-xl"
                        >
                          Volver a la Applet
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Simulated Home Button navigation bar */}
                <div className="h-10 bg-slate-950/90 border-t border-slate-950/80 flex justify-center items-center gap-12 text-slate-400 text-xs select-none shadow-md">
                  <div className="h-3.5 w-3.5 border border-slate-600 rounded flex items-center justify-center cursor-pointer hover:border-white transition-colors" title="Atrás" />
                  <div
                    onClick={() => {
                      if (permissionState === "granted") setIsSimulating(!isSimulating);
                    }}
                    className="h-3 w-5 border border-slate-600 rounded-full cursor-pointer hover:border-white transition-colors"
                    title="Home / Pause"
                  />
                  <div className="text-[11px] font-medium text-slate-500 cursor-pointer hover:text-white transition-colors select-none">◀</div>
                </div>

              </div>

            </div>
          </div>

          {/* FIRESTORE MONITORED MONITOR CLOUD CONSOLE */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-400 animate-pulse" />
                <h3 className="font-bold text-white text-sm">
                  Firestore Live Watcher
                </h3>
              </div>
              <span className="text-[9px] font-mono bg-emerald-950/40 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800/30">
                ubicaciones/
              </span>
            </div>

            {/* Document contents simulation JSON */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-xs font-mono mb-4 text-emerald-300 overflow-x-auto shadow-inner relative max-h-[140px] flex-shrink-0">
              <div className="absolute top-2 right-2 text-[8px] bg-slate-950 px-2 py-0.5 rounded border border-slate-850 text-slate-400">
                DOCUMENTO: usuario_simulado_id
              </div>
              <pre className="mt-2 text-slate-100 text-[11px] leading-relaxed">
{`{
  "latitud": ${lat.toFixed(8)},
  "longitud": ${lon.toFixed(8)},
  "ciudad": "Trujillo",
  "region": "La Libertad",
  "pais": "Perú",
  "timestamp": {
    "nanoseconds": 432000000,
    "seconds": ${Math.floor(Date.now() / 1000)}
  },
  "deviceInfo": "Servicio de Monitoreo Trujillo GPS (Android client)"
}`}
              </pre>
            </div>

            {/* Snapshot reactive log console */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 px-1">
              <span>Bitácora del Snapshot Listener activa:</span>
              <span className="text-[9px] text-slate-500">Filtrado por: GeoSyncApp</span>
            </div>

            {/* Terminal styled logging logs */}
            <div className="flex-1 bg-slate-950 rounded-xl border border-slate-850/80 p-3 overflow-y-auto max-h-[160px] font-mono text-[10px] leading-relaxed space-y-2 select-text">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 items-start border-b border-slate-900/40 pb-1">
                  <span className="text-slate-500 flex-shrink-0 text-[9px]">{log.time}</span>
                  <span className={`font-semibold flex-shrink-0 ${
                    log.type === "success" ? "text-emerald-400" :
                    log.type === "error" ? "text-rose-400" :
                    log.type === "warning" ? "text-amber-400" : "text-sky-400"
                  }`}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>

          </div>

        </div>

        {/* Right Side: Architecture & Kotlin Code Workspace (7 Columns) */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl flex flex-col p-5 overflow-hidden">
          
          {/* Header Code Panel */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-indigo-400" />
                <h2 className="font-bold text-white text-lg tracking-tight">
                  Explorador de Arquitectura Android MVVM
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Estructura desacoplada y limpia que implementa los requerimientos funcionales solicitados.
              </p>
            </div>
            
            {/* Search inside project file titles */}
            <div className="relative w-full md:w-56">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar archivos Kotlin..."
                className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg pl-8.5 pr-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 overflow-hidden min-h-[480px]">
            
            {/* Navigation Tree (4 Columns) */}
            <div className="md:col-span-4 border-r border-slate-900 pr-2 flex flex-col gap-2.5 overflow-y-auto max-h-[560px]">
              
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-2 pt-1 font-mono">
                Estructura de Carpetas (.kt / .xml)
              </div>

              <div className="space-y-1.5 flex-1">
                {filteredProjectFiles.map((file) => {
                  const isSelected = selectedFile.name === file.name;
                  return (
                    <button
                      key={file.name}
                      onClick={() => setSelectedFile(file)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all border flex flex-col gap-1.5 ${
                        isSelected
                          ? "bg-slate-900 border-indigo-500/80 text-white shadow-sm"
                          : "bg-slate-950 border-transparent text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {file.language === "kotlin" ? (
                          <div className="h-4.5 w-4.5 rounded bg-amber-950/20 text-indigo-400 flex items-center justify-center font-mono text-[9px] font-extrabold border border-indigo-900/30">
                            KT
                          </div>
                        ) : (
                          <div className="h-4.5 w-4.5 rounded bg-slate-900 text-slate-400 flex items-center justify-center font-mono text-[9px] font-extrabold border border-slate-800">
                            Manifest
                          </div>
                        )}
                        <span className="font-bold text-xs truncate max-w-[130px]">{file.name}</span>
                      </div>
                      
                      <span className="text-[9.5px] leading-relaxed text-slate-500 line-clamp-2">
                        {file.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Informative clean tip */}
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-850/60 mt-auto">
                <div className="flex items-start gap-2">
                  <Terminal className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[9.5px] text-slate-400 leading-normal">
                    Este diseño adopta <strong className="text-slate-300">MVVM riguroso</strong> mediante la separación limpia entre Repository (`FirestoreLocationRepository.kt`), ViewModel (`LocationViewModel.kt`), y la UI Declarativa de Compose.
                  </p>
                </div>
              </div>

            </div>

            {/* Code Workspace Display IDE (8 Columns) */}
            <div className="md:col-span-8 flex flex-col overflow-hidden bg-slate-900/40 rounded-2xl border border-slate-850">
              
              {/* TOP TAB CONTROL WITH SELECTED INFO */}
              <div className="bg-slate-950 border-b border-slate-900 px-4 py-2.5 flex justify-between items-center flex-shrink-0">
                <div className="flex flex-col gap-0.5">
                  <div className="text-[10px] font-mono text-indigo-400 font-semibold tracking-wider">
                    {selectedFile.path}
                  </div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {selectedFile.name}
                  </div>
                </div>

                <button
                  onClick={() => handleCopyCode(selectedFile.content, selectedFile.name)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    copiedFile === selectedFile.name
                      ? "bg-emerald-650 text-white font-semibold"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-800"
                  }`}
                >
                  {copiedFile === selectedFile.name ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copiar Código
                    </>
                  )}
                </button>
              </div>

              {/* KOTLIN CODE CONTAINER VIEW - SYNTHAX STYLED */}
              <div className="flex-1 overflow-x-auto overflow-y-auto p-4 font-mono text-[11px] leading-relaxed select-text text-slate-300">
                <pre className="whitespace-pre">
                  <code>{selectedFile.content}</code>
                </pre>
              </div>

              {/* BOTTOM FOOTER INFO REGARDING WORKSPACE INTEGRITY */}
              <div className="bg-slate-950 p-2 border-t border-slate-900 flex justify-between items-center text-[9px] font-mono text-slate-500 px-4 flex-shrink-0">
                <span>Codificación compatible con Kotlin 1.9+, Gradle 8+, SDK 34</span>
                <span>UUID: AndroidManifest_Sourced</span>
              </div>

            </div>

          </div>

        </div>

      </main>

      {/* Corporate footer info */}
      <footer className="bg-slate-950 border-t border-slate-800 p-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 Google AI Studio. Todo el código generado cumple con Clean Architecture, MVVM, y las pautas para Firebase Firestore v2.</p>
          <div className="flex gap-4">
            <a href="#rules" className="hover:text-slate-300 transition-colors">Normativa Firestore</a>
            <span>•</span>
            <a href="#maps" className="hover:text-slate-300 transition-colors">SDK Android Maps</a>
            <span>•</span>
            <a href="#mvvm" className="hover:text-slate-300 transition-colors">MVVM Clean Architecture</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
