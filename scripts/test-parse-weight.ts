/**
 * Tests para la función parseWeightInputToGrams
 * 
 * Ejecutar con: node --import tsx scripts/test-parse-weight.ts
 * o simplemente: npx tsx scripts/test-parse-weight.ts
 */

import { parseWeightInputToGrams } from '../src/lib/sale-item';

const GRAMS_PER_KILO = 1000;

interface TestCase {
  input: string;
  expected: number | null;
  assumeWholeNumbersAreKilos?: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // Decimales sin unidad (CASO CRÍTICO - bug original)
  { input: '1.5', expected: 1500, description: '1.5 (sin unidad) → 1.5kg = 1500g' },
  { input: '0.5', expected: 500, description: '0.5 (sin unidad) → 0.5kg = 500g' },
  { input: '0.250', expected: 250, description: '0.250 (sin unidad) → 0.25kg = 250g' },
  { input: '2.3', expected: 2300, description: '2.3 (sin unidad) → 2.3kg = 2300g' },
  
  // Enteros sin unidad (asume gramos por defecto)
  { input: '250', expected: 250, description: '250 (sin unidad) → 250g' },
  { input: '1000', expected: 1000, description: '1000 (sin unidad) → 1000g' },
  { input: '500', expected: 500, description: '500 (sin unidad) → 500g' },
  
  // Con unidad explícita 'g' o 'gr'
  { input: '250g', expected: 250, description: '250g → 250g' },
  { input: '500 g', expected: 500, description: '500 g → 500g' },
  { input: '1000gr', expected: 1000, description: '1000gr → 1000g' },
  { input: '1.5g', expected: 1.5, description: '1.5g → 1.5g (redondeado a 2)' },
  
  // Con unidad explícita 'kg'
  { input: '1kg', expected: 1000, description: '1kg → 1000g' },
  { input: '1.5kg', expected: 1500, description: '1.5kg → 1500g' },
  { input: '0.5 kg', expected: 500, description: '0.5 kg → 500g' },
  { input: '2kg', expected: 2000, description: '2kg → 2000g' },
  
  // Fracciones
  { input: '1/2', expected: 500, description: '1/2 → 0.5kg = 500g' },
  { input: '1/4', expected: 250, description: '1/4 → 0.25kg = 250g' },
  { input: '3/4', expected: 750, description: '3/4 → 0.75kg = 750g' },
  { input: '1 / 2', expected: 500, description: '1 / 2 → 0.5kg = 500g' },
  
  // Con assumeWholeNumbersAreKilos = true
  { input: '1.5', expected: 1500, assumeWholeNumbersAreKilos: true, description: '1.5 (kilos=true) → 1500g' },
  { input: '250', expected: 250000, assumeWholeNumbersAreKilos: true, description: '250 (kilos=true) → 250kg = 250000g' },
  { input: '0.5', expected: 500, assumeWholeNumbersAreKilos: true, description: '0.5 (kilos=true) → 500g' },
  
  // Casos borde
  { input: '', expected: null, description: 'vacío → null' },
  { input: 'abc', expected: null, description: 'texto inválido → null' },
  { input: '0', expected: null, description: 'cero → null' },
  { input: '-5', expected: null, description: 'negativo → null' },
  { input: '1/0', expected: null, description: 'fracción con denominador cero → null' },
];

let passed = 0;
let failed = 0;

console.log('='.repeat(70));
console.log('Tests para parseWeightInputToGrams');
console.log('='.repeat(70));
console.log();

for (const testCase of testCases) {
  const { input, expected, assumeWholeNumbersAreKilos, description } = testCase;
  const actual = parseWeightInputToGrams(input, assumeWholeNumbersAreKilos ?? false);
  
  // Para el caso de 1.5g, el redondeo es a 2 (Math.round(1.5) = 2)
  const adjustedExpected = (input === '1.5g' && expected === 1.5) ? 2 : expected;
  
  const success = actual === adjustedExpected;
  
  if (success) {
    passed++;
    console.log(`✅ PASS: ${description}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${description}`);
    console.log(`   Input: "${input}"${assumeWholeNumbersAreKilos ? ' (assumeWholeNumbersAreKilos=true)' : ''}`);
    console.log(`   Expected: ${adjustedExpected}, Got: ${actual}`);
  }
}

console.log();
console.log('='.repeat(70));
console.log(`Resultados: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
}
