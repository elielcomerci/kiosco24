export type DefaultCatalogCategoryKey =
  | "bebidas"
  | "alfajores"
  | "galletitas"
  | "golosinas"
  | "snacks";

export interface DefaultCatalogCategorySeed {
  key: DefaultCatalogCategoryKey;
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
  categoryKey: DefaultCatalogCategoryKey;
}

export const DEFAULT_KIOSCO_CATEGORIES: DefaultCatalogCategorySeed[] = [
  { key: "bebidas", name: "Bebidas", color: "#38bdf8" },
  { key: "alfajores", name: "Alfajores", color: "#f59e0b" },
  { key: "galletitas", name: "Galletitas", color: "#a78bfa" },
  { key: "golosinas", name: "Golosinas", color: "#fb7185" },
  { key: "snacks", name: "Snacks", color: "#34d399" },
];

export const DEFAULT_KIOSCO_PRODUCTS: DefaultCatalogProductSeed[] = [
  {
    name: "Villavicencio con gas 500 ml",
    brand: "Villavicencio",
    description: "Agua mineral con gas.",
    presentation: "500 ml",
    barcode: "7799155000203",
    price: 900,
    cost: 500,
    categoryKey: "bebidas",
  },
  {
    name: "Levite pomelo 500 ml",
    brand: "Levite",
    description: "Agua saborizada sabor pomelo.",
    presentation: "500 ml",
    barcode: "7798062548686",
    price: 1200,
    cost: 750,
    categoryKey: "bebidas",
  },
  {
    name: "Gatorade Manzana 500 ml",
    brand: "Gatorade",
    description: "Bebida isotonic sabor manzana.",
    presentation: "500 ml",
    barcode: "7792170042005",
    price: 1800,
    cost: 1200,
    categoryKey: "bebidas",
  },
  {
    name: "Baggio Pronto Multifruta 200 ml",
    brand: "Baggio",
    description: "Jugo listo para tomar.",
    presentation: "200 ml",
    barcode: "7790036000619",
    price: 800,
    cost: 450,
    categoryKey: "bebidas",
  },
  {
    name: "Cepita Naranja Tentacion 300 ml",
    brand: "Cepita del Valle",
    description: "Jugo de naranja listo para tomar.",
    presentation: "300 ml",
    barcode: "7790897302044",
    price: 1100,
    cost: 650,
    categoryKey: "bebidas",
  },
  {
    name: "Alfajor Jorgito 55 g",
    brand: "Jorgito",
    description: "Alfajor clasico de dulce de leche.",
    presentation: "55 g",
    barcode: "77905741",
    price: 800,
    cost: 450,
    categoryKey: "alfajores",
  },
  {
    name: "Alfajor Guaymallen dulce de leche 38 g",
    brand: "Guaymallen",
    description: "Alfajor simple de dulce de leche.",
    presentation: "38 g",
    barcode: "77980229",
    price: 700,
    cost: 380,
    categoryKey: "alfajores",
  },
  {
    name: "Maxialfajor Jorgelin 85 g",
    brand: "Jorgelin",
    description: "Alfajor triple de dulce de leche.",
    presentation: "85 g",
    barcode: "77901705",
    price: 1100,
    cost: 650,
    categoryKey: "alfajores",
  },
  {
    name: "Tita 36 g",
    brand: "Terrabusi",
    description: "Galletita con relleno y cobertura.",
    presentation: "36 g",
    barcode: "77908308",
    price: 700,
    cost: 380,
    categoryKey: "alfajores",
  },
  {
    name: "Rhodesia 22 g",
    brand: "Terrabusi",
    description: "Snack dulce relleno con cobertura.",
    presentation: "22 g",
    barcode: "77995681",
    price: 700,
    cost: 380,
    categoryKey: "alfajores",
  },
  {
    name: "Chocolinas Original 250 g",
    brand: "Bagley",
    description: "Galletitas de chocolate.",
    presentation: "250 g",
    barcode: "7790040143234",
    price: 1900,
    cost: 1200,
    categoryKey: "galletitas",
  },
  {
    name: "Sonrisas 108 g",
    brand: "Bagley",
    description: "Galletitas dulces rellenas.",
    presentation: "108 g",
    barcode: "7790040133488",
    price: 1100,
    cost: 650,
    categoryKey: "galletitas",
  },
  {
    name: "Criollitas original 100 g",
    brand: "Bagley",
    description: "Galletitas saladas clasicas.",
    presentation: "100 g",
    barcode: "7790040377707",
    price: 950,
    cost: 550,
    categoryKey: "galletitas",
  },
  {
    name: "Opera 92 g",
    brand: "Bagley",
    description: "Galletitas rellenas sabor chocolate.",
    presentation: "92 g",
    barcode: "77903518",
    price: 1000,
    cost: 600,
    categoryKey: "galletitas",
  },
  {
    name: "Beldent sabor Frutilla 10 g",
    brand: "Beldent",
    description: "Chicle sin azucar sabor frutilla.",
    presentation: "10 g",
    barcode: "77969118",
    price: 700,
    cost: 380,
    categoryKey: "golosinas",
  },
  {
    name: "Beldent Chicle Globo 10 g",
    brand: "Beldent",
    description: "Chicle sabor globo.",
    presentation: "10 g",
    barcode: "77969101",
    price: 700,
    cost: 380,
    categoryKey: "golosinas",
  },
  {
    name: "Mentitas frutal",
    brand: "Mentitas",
    description: "Caramelos masticables sabor frutal.",
    presentation: "unidad",
    barcode: "7798094340555",
    price: 600,
    cost: 320,
    categoryKey: "golosinas",
  },
  {
    name: "Rocklets 40 g",
    brand: "Arcor",
    description: "Confites de chocolate.",
    presentation: "40 g",
    barcode: "7790580327415",
    price: 1200,
    cost: 700,
    categoryKey: "golosinas",
  },
  {
    name: "Cofler Block 38 g",
    brand: "Cofler",
    description: "Chocolate con leche.",
    presentation: "38 g",
    barcode: "77953124",
    price: 1300,
    cost: 800,
    categoryKey: "golosinas",
  },
  {
    name: "Halls miel y limon",
    brand: "Halls",
    description: "Caramelos sabor miel y limon.",
    presentation: "unidad",
    barcode: "77905277",
    price: 650,
    cost: 350,
    categoryKey: "golosinas",
  },
  {
    name: "Doritos sabor queso 77 g",
    brand: "Doritos",
    description: "Nachos sabor queso.",
    presentation: "77 g",
    barcode: "7790310985649",
    price: 1800,
    cost: 1100,
    categoryKey: "snacks",
  },
  {
    name: "Palitos salados Pehuamar",
    brand: "Pehuamar",
    description: "Palitos salados clasicos.",
    presentation: "unidad",
    barcode: "7790310984352",
    price: 1300,
    cost: 800,
    categoryKey: "snacks",
  },
  {
    name: "Palitos salados Krachitos 110 g",
    brand: "Krachitos",
    description: "Palitos salados crocantes.",
    presentation: "110 g",
    barcode: "7794520868969",
    price: 1200,
    cost: 700,
    categoryKey: "snacks",
  },
  {
    name: "Mani con chocolate Namur 80 g",
    brand: "Namur",
    description: "Mani confitado con chocolate.",
    presentation: "80 g",
    barcode: "7790380014690",
    price: 1100,
    cost: 650,
    categoryKey: "snacks",
  },
  {
    name: "9 de Oro clasicos 200 g",
    brand: "9 de Oro",
    description: "Bizcochos clasicos.",
    presentation: "200 g",
    barcode: "7792200000159",
    price: 1300,
    cost: 750,
    categoryKey: "snacks",
  },
];

export const DEFAULT_KIOSCO_PRODUCT_COUNT = DEFAULT_KIOSCO_PRODUCTS.length;
export const DEFAULT_KIOSCO_SCANNABLE_PRODUCT_COUNT = DEFAULT_KIOSCO_PRODUCTS.filter(
  (product) => Boolean(product.barcode),
).length;
