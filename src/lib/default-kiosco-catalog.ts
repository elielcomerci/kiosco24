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
// un producto cargado, sin abrumarlos con docenas de entradas.
export const DEFAULT_SEED_BY_ACTIVITY: Record<string, ActivityCatalogSeed> = {
  KIOSCO: {
    category: { key: "alfajores", name: "Alfajores y Golosinas", color: "#6366f1" },
    product: {
      name: "Alfajor Triple Torta",
      brand: undefined,
      description: "Alfajor de chocolate relleno con dulce de leche.",
      presentation: "70g",
      barcode: "77903860", // Terrabusi Triple Torta
      price: 1200,
      cost: 750,
      categoryKey: "alfajores",
    },
  },
  MAXIKIOSCO: {
    category: { key: "alfajores", name: "Alfajores y Golosinas", color: "#6366f1" },
    product: {
      name: "Alfajor Triple Torta",
      brand: undefined,
      description: "Alfajor de chocolate relleno con dulce de leche.",
      presentation: "70g",
      barcode: "77903860", // Terrabusi Triple Torta
      price: 1200,
      cost: 750,
      categoryKey: "alfajores",
    },
  },
  ALMACEN: {
    category: { key: "fideos", name: "Pastas y Fideos", color: "#f59e0b" },
    product: {
      name: "Fideos Al Huevo Tallarín",
      brand: undefined,
      description: "Paquete de fideos secos tallarín",
      presentation: "500g",
      barcode: "7790070335364", // Lucchetti
      price: 1400,
      cost: 900,
      categoryKey: "fideos",
    },
  },
  MINIMERCADO: {
    category: { key: "fideos", name: "Pastas y Fideos", color: "#f59e0b" },
    product: {
      name: "Fideos Al Huevo Tallarín",
      brand: undefined,
      description: "Paquete de fideos secos tallarín",
      presentation: "500g",
      barcode: "7790070335364", // Lucchetti
      price: 1400,
      cost: 900,
      categoryKey: "fideos",
    },
  },
  CAFETERIA: {
    category: { key: "cafeteria", name: "Cafetería", color: "#fb923c" },
    product: {
      name: "Café Instantáneo",
      brand: undefined,
      description: "Frasco de café instantáneo clásico.",
      presentation: "100g",
      barcode: "7790150100783", // La Virginia
      price: 1200,
      cost: 400,
      categoryKey: "cafeteria",
    },
  },
  PANADERIA: {
    category: { key: "panaderia", name: "Panadería", color: "#fbbf24" },
    product: {
      name: "Pan de Mesa Lactal",
      brand: undefined,
      description: "Pan de mesa integral envasado.",
      presentation: "390g",
      barcode: "7891962064055", // Bauducco
      price: 2200,
      cost: 900,
      categoryKey: "panaderia",
    },
  },
  VERDULERIA: {
    category: { key: "almacen", name: "Almacén", color: "#4ade80" },
    product: {
      name: "Puré de Tomate",
      brand: undefined,
      description: "Puré de tomate en caja.",
      presentation: "520g",
      barcode: "7790123001109", // Vigente
      price: 1100,
      cost: 600,
      categoryKey: "almacen",
    },
  },
  ROTISERIA: {
    category: { key: "rotiseria", name: "Rotisería", color: "#f87171" },
    product: {
      name: "Tapas de Empanada",
      brand: undefined,
      description: "Tapas para empanada de horno o freír.",
      presentation: "605g",
      barcode: "7790236018353", // La Salteña
      price: 800,
      cost: 350,
      categoryKey: "rotiseria",
    },
  },
  FARMACIA: {
    category: { key: "medicamentos", name: "Medicamentos", color: "#a78bfa" },
    product: {
      name: "Ibuprofeno 400 mg Ibupirac x30",
      brand: "Ibupirac",
      description: "Antiinflamatorio no esteroide para dolores leves y fiebre.",
      presentation: "x30 comp.",
      barcode: "7790040592013",
      price: 3800,
      cost: 2400,
      categoryKey: "medicamentos",
    },
  },
  PETSHOP: {
    category: { key: "alimentos", name: "Alimentos para Mascotas", color: "#fb7185" },
    product: {
      name: "Alimento Pedigree Adultos 3 kg",
      brand: "Pedigree",
      description: "Alimento balanceado para perros adultos.",
      presentation: "3 kg",
      barcode: "7796181001015",
      price: 8500,
      cost: 6200,
      categoryKey: "alimentos",
    },
  },
  LIBRERIA: {
    category: { key: "libreria", name: "Librería y Papelería", color: "#2dd4bf" },
    product: {
      name: "Cuaderno Éxito Rayado Tapa Dura A4",
      brand: "Éxito",
      description: "Cuaderno escolar rayado, tamaño A4, tapa dura.",
      presentation: "unidad",
      barcode: "7798064820010",
      price: 5500,
      cost: 3500,
      categoryKey: "libreria",
    },
  },
  VETERINARIA: {
    category: { key: "alimentos", name: "Alimentos para Mascotas", color: "#fb7185" },
    product: {
      name: "Alimento Excellent Gatos Adultos 1.5 kg",
      brand: "Purina Excellent",
      description: "Alimento balanceado premium para gatos adultos.",
      presentation: "1.5 kg",
      barcode: "7796181002029",
      price: 12500,
      cost: 8500,
      categoryKey: "alimentos",
    },
  },
  GASTRONOMICO: {
    category: { key: "bebidas", name: "Bebidas", color: "#38bdf8" },
    product: {
      name: "Cerveza Blanca Quilmes sin Alcohol",
      brand: undefined,
      description: "Lata de cerveza clásica sin alcohol.",
      presentation: "473cc",
      barcode: "7792798009114", // Quilmes
      price: 1800,
      cost: 1100,
      categoryKey: "bebidas",
    },
  },
  INDUMENTARIA: {
    category: { key: "remeras", name: "Remeras y Camisetas", color: "#e879f9" },
    product: {
      name: "Remera Básica Algodón Lisa",
      brand: undefined,
      description: "Remera cuello redondo 100% algodón. Colores surtidos.",
      presentation: "unidad",
      barcode: "0000000000010",
      price: 8500,
      cost: 4500,
      categoryKey: "remeras",
    },
  },
  FERRETERIA: {
    category: { key: "herramientas", name: "Herramientas e Insumos", color: "#9ca3af" },
    product: {
      name: "Mop de Algodón Vileda",
      brand: undefined,
      description: "Mopa de algodón para limpieza.",
      presentation: "repuesto",
      barcode: "7798008380783", // Vileda
      price: 2500,
      cost: 1200,
      categoryKey: "herramientas",
    },
  },
};

// Fallback universal si el rubro no existe en el diccionario o si no hay rubro
export const DEFAULT_SEED_FALLBACK: ActivityCatalogSeed = {
  category: { key: "general", name: "General", color: "#94a3b8" },
  product: {
    name: "Jabon en Polvo Matic",
    brand: undefined,
    description: "Jabón en polvo para lavarropas.",
    presentation: "3 Kg",
    barcode: "7791290791787", // Ala
    price: 7500,
    cost: 5000,
    categoryKey: "general",
  },
};
