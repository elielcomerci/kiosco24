export interface DefaultCatalogCategorySeed {
  key: string;
  name: string;
  color: string;
}

export interface DefaultCatalogProductSeed {
  name: string;
  brand?: string;
  description?: string;
  presentation?: string;
  barcode: string;
  price: number;
  cost: number;
  categoryKey: string;
}

export interface ActivityCatalogSeed {
  category: DefaultCatalogCategorySeed;
  product: DefaultCatalogProductSeed;
}

// ─── Siembra por Rubro (1 producto representativo por actividad) ──────────────
// El objetivo es darle al nuevo cliente un ejemplo realista de cómo se ve
// un producto cargado, priorizando productos con códigos EAN reales y universales
// para que el catálogo colaborativo traccione automáticamente la foto y los detalles.
export const DEFAULT_SEED_BY_ACTIVITY: Record<string, ActivityCatalogSeed> = {
  KIOSCO: {
    category: { key: "alfajores", name: "Alfajores y Golosinas", color: "#6366f1" },
    product: {
      name: "Alfajor Guaymallén Blanco",
      brand: "Guaymallén",
      description: "Alfajor relleno con dulce de leche bañado en azúcar blanca.",
      presentation: "38g",
      barcode: "7790828114030", // Real EAN
      price: 600,
      cost: 350,
      categoryKey: "alfajores",
    },
  },
  MAXIKIOSCO: {
    category: { key: "bebidas", name: "Bebidas", color: "#38bdf8" },
    product: {
      name: "Gaseosa Coca-Cola Sabor Original",
      brand: "Coca-Cola",
      description: "Bebida sin alcohol gasificada, sabor cola.",
      presentation: "500ml",
      barcode: "7790895000997", // Real EAN
      price: 1500,
      cost: 950,
      categoryKey: "bebidas",
    },
  },
  ALMACEN: {
    category: { key: "fideos", name: "Pastas y Fideos", color: "#f59e0b" },
    product: {
      name: "Fideos Tallarín Lucchetti",
      brand: "Lucchetti",
      description: "Fideos secos cinta de sémola.",
      presentation: "500g",
      barcode: "7790070335364", // Real EAN
      price: 1400,
      cost: 900,
      categoryKey: "fideos",
    },
  },
  MINIMERCADO: {
    category: { key: "conservas", name: "Conservas", color: "#f59e0b" },
    product: {
      name: "Puré de Tomate La Campagnola",
      brand: "La Campagnola",
      description: "Puré de tomate tetrabrik tradicional.",
      presentation: "520g",
      barcode: "7793360000157", // Real EAN
      price: 1350,
      cost: 750,
      categoryKey: "conservas",
    },
  },
  CAFETERIA: {
    category: { key: "cafeteria", name: "Cafetería", color: "#fb923c" },
    product: {
      name: "Café Instantáneo Clásico La Virginia",
      brand: "La Virginia",
      description: "Frasco de café instantáneo clásico.",
      presentation: "100g",
      barcode: "7790150100783", // Real EAN
      price: 5200,
      cost: 3400,
      categoryKey: "cafeteria",
    },
  },
  PANADERIA: {
    category: { key: "panaderia", name: "Pan y Derivados", color: "#fbbf24" },
    product: {
      name: "Pan Lactal Blanco Familiar",
      brand: "Bimbo",
      description: "Pan de molde blanco, envasado.",
      presentation: "400g",
      barcode: "7790080036084", // Real EAN Bimbo
      price: 2500,
      cost: 1300,
      categoryKey: "panaderia",
    },
  },
  VERDULERIA: {
    category: { key: "huevos", name: "Huevos y Frescos", color: "#4ade80" },
    product: {
      name: "Maple de Huevos Blancos Grandes",
      brand: "Granja",
      description: "Maple clásico, tamaño grande.",
      presentation: "30 unidades",
      barcode: "0020000000030", // Short SKU for fresh
      price: 4500,
      cost: 3200,
      categoryKey: "huevos",
    },
  },
  ROTISERIA: {
    category: { key: "refrigerados", name: "Tapas y Pastas", color: "#f87171" },
    product: {
      name: "Tapas de Empanada La Salteña Horno",
      brand: "La Salteña",
      description: "Tapas para empanada de horno frescas.",
      presentation: "12 unidades",
      barcode: "7790236018353", // Real EAN
      price: 1800,
      cost: 1150,
      categoryKey: "refrigerados",
    },
  },
  FARMACIA: {
    category: { key: "medicamentos", name: "Medicamentos OTC", color: "#a78bfa" },
    product: {
      name: "Ibupirac 400mg Capsulas",
      brand: "Ibupirac",
      description: "Analgésico, antiinflamatorio no esteroide.",
      presentation: "x10 caps.",
      barcode: "7790040592013", // Real EAN
      price: 3200,
      cost: 1800,
      categoryKey: "medicamentos",
    },
  },
  PETSHOP: {
    category: { key: "alimentos", name: "Alimentos para Mascotas", color: "#fb7185" },
    product: {
      name: "Alimento Pedigree Adultos Carne y Pollo",
      brand: "Pedigree",
      description: "Balanceado seco para perros adultos. Nutrición completa.",
      presentation: "3kg",
      barcode: "7796181001015", // Real EAN
      price: 9500,
      cost: 6800,
      categoryKey: "alimentos",
    },
  },
  LIBRERIA: {
    category: { key: "libreria", name: "Librería Escolar", color: "#2dd4bf" },
    product: {
      name: "Cuaderno Éxito Rayado E3 Tapa Dura",
      brand: "Éxito",
      description: "Cuaderno escolar clásico de tapa dura.",
      presentation: "50 Hojas",
      barcode: "7798064820010", // Real EAN
      price: 5500,
      cost: 3500,
      categoryKey: "libreria",
    },
  },
  VETERINARIA: {
    category: { key: "alimentos", name: "Alimentos Felines", color: "#fb7185" },
    product: {
      name: "Alimento Excellent Gatos Adultos",
      brand: "Purina Excellent",
      description: "Alimento balanceado premium para gatos.",
      presentation: "1.5 kg",
      barcode: "7796181002029", // Real EAN
      price: 13500,
      cost: 9500,
      categoryKey: "alimentos",
    },
  },
  GASTRONOMICO: {
    category: { key: "bebidas", name: "Bebidas Alcohólicas", color: "#38bdf8" },
    product: {
      name: "Cerveza Quilmes Clásica",
      brand: "Quilmes",
      description: "Lata de cerveza clásica rubia.",
      presentation: "473ml",
      barcode: "7792798009114", // Real EAN
      price: 1900,
      cost: 1200,
      categoryKey: "bebidas",
    },
  },
  INDUMENTARIA: {
    category: { key: "basicos", name: "Indumentaria Básica", color: "#e879f9" },
    product: {
      name: "Medias de Algodón Básicas",
      brand: "Básicos",
      description: "Medias deportivas de algodón colores surtidos.",
      presentation: "Par",
      barcode: "0000000000010", // No strict EAN needed
      price: 2500,
      cost: 1200,
      categoryKey: "basicos",
    },
  },
  FERRETERIA: {
    category: { key: "herramientas", name: "Ferretería y Herrajes", color: "#9ca3af" },
    product: {
      name: "Cinta Aisladora 3M Temflex 1500 Negra",
      brand: "3M",
      description: "Cinta aislante eléctrica de PVC antillama.",
      presentation: "10m",
      barcode: "7790359045763", // Real EAN
      price: 2800,
      cost: 1500,
      categoryKey: "herramientas",
    },
  },
};

// Fallback universal si el rubro no existe en el diccionario o si no hay rubro
export const DEFAULT_SEED_FALLBACK: ActivityCatalogSeed = {
  category: { key: "general", name: "Bebidas y Generales", color: "#38bdf8" },
  product: {
    name: "Agua Mineral Villavicencio sin Gas",
    brand: "Villavicencio",
    description: "Agua mineral natural de manantial sin gas.",
    presentation: "500ml",
    barcode: "7790315000213", // Real EAN Villavicencio
    price: 1100,
    cost: 500,
    categoryKey: "general",
  },
};
