// =====================================================================
//  CONFIGURACIÓN - PrograFAB (extensión de Trimble Connect)
//  Este es el único archivo que normalmente hay que editar.
// =====================================================================
window.CONFIG = {
  // Grupo de propiedades que exporta SteelX / Advance Steel en el IFC
  pset: "Nabla Aceros",

  // --- Dónde se guardan las fases dentro del proyecto de Trimble Connect ---
  // (la carpeta debe existir; si no existe, las fases quedan solo en este navegador)
  carpetaFases: "5_FAB/5.3_LISTADOS/5.3.5-PROGRAMACION",
  // nombre del archivo: {proy} se reemplaza por el número de proyecto
  archivoFases: "PrograFAB_{proy}.json",

  // Número de proyecto: primeros dígitos del nombre del proyecto de Trimble Connect
  patronProyecto: "^\\s*(\\d{3,5})",

  // --- Roles (hoja «Catalogo de roles» de Control_Listados_Ing_Detalle.xlsm) ---
  // Patines y almas de perfiles armados: si la placa es rectangular se suman en metros lineales
  rolesPatin: ["Flange Girder", "Flange Column", "Flange Rafter", "Patin Viga", "Patin Columna",
               "Flange T", "Flange Angle", "Haunchflange"],
  rolesAlma:  ["Web Girder", "Web Column", "Web Rafter", "Web Brace", "Alma Cartela Viga", "Alma Cartela Columna",
               "Parte Recta Viga", "Parte Recta Columna", "PlatedBeam-Web", "Haunchweb"],
  // Tolerancia para decidir que una placa es rectangular (área real vs ancho x largo)
  tolRecta: 0.01,

  // Roles que NO SE FABRICAN (no salen en los listados)
  rolesNoFabrica: ["Anchor - No Standard", "Anchor beam", "Anchor Bolt", "Anchor camera", "Beam not unfolded",
    "Blind hole", "Bocatubo", "Bolt", "Bolt Above", "Bolt Below", "Bolt Web", "Bottom Landing", "Center mark",
    "Cladding Screw", "Concrete beam", "Concrete beams", "Concrete ceiling", "Concrete foundation", "Concrete Landing",
    "Concrete Landing Bottom", "Concrete Landing Top", "Concrete Quarter Landing", "Concrete Stair Flight",
    "Concrete Stair Footer", "Concrete wall", "Countersink hole", "Countersunk hole", "Environment", "Existing",
    "Feature", "Fischer Anchor", "Glass", "Group", "Hilti Anchor", "Hole", "Intersection camera", "Node camera",
    "None", "Not overridden role", "Not visible", "Nut", "Off", "Overview camera", "Plant 3D - Equipment",
    "Plant 3D - Pipe", "Plant 3D - Pipe inline asset", "Plant 3D - Structure anchorage", "Plant 3D - Structure footing",
    "Plant 3D - Structure grating", "Plant 3D - Structure ladder", "Plant 3D - Structure member",
    "Plant 3D - Structure plate", "Plant 3D - Structure railing", "Plant 3D - Structure stair", "Plant 3D - Support",
    "Roof camera", "Shear Stud", "Shear Stud Welding", "Slab", "Slotted Hole", "Solid objects", "Special Nuts",
    "Special Washers", "Stem", "Tensioner", "Threaded hole", "Timber Tread", "Upat Anchor", "Visible", "Weld", "Welding"],

  // Colores que se van asignando a las fases nuevas
  coloresFase: ["#2E75D6", "#2CA02C", "#F2C500", "#8E44AD", "#D62728", "#17BECF",
                "#E377C2", "#8C564B", "#FFB000", "#0B2E6B", "#00A087", "#7F3C8D"],
  colorSinFase: "#BDBDBD",

  // Logo del cajetín de los listados Excel (PNG en la raíz del repositorio)
  logoListado: "logo.png",

  // Grupos del proyecto de Trimble Connect que NO pueden usar la extensión (igual que Avance NABLA)
  gruposBloqueados: ["EXTERNO"]
};
