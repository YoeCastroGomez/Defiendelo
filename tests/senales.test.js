// Señales del navegador (public/js/senales.js): el mismo archivo lo usan el cliente y el servidor.
// Corre con `node --test`, sin navegador: el script se registra en globalThis.Senales.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

await import('../public/js/senales.js');
const { contencion, leyoTrabajo, esDubitativo, UMBRAL_LECTURA } = globalThis.Senales;

const TRABAJO = 'Elegimos el patrón Observer porque la reserva no debe conocer a cada canal de aviso. Cada canal se suscribe y recibe el evento.';

describe('lectura literal del trabajo', () => {
  test('una copia exacta se detecta, sin importar tildes, mayúsculas ni signos', () => {
    const copia = 'ELEGIMOS el patron observer, porque la reserva NO debe conocer a cada canal de aviso';
    assert.equal(contencion(copia, TRABAJO), 1);
    assert.equal(leyoTrabajo(copia, TRABAJO), true);
  });

  test('una explicación con palabras propias no cuenta como lectura', () => {
    const propia = 'Lo hicimos así para que agregar un canal nuevo no obligue a tocar el código de la reserva';
    assert.ok(contencion(propia, TRABAJO) < UMBRAL_LECTURA);
    assert.equal(leyoTrabajo(propia, TRABAJO), false);
  });

  test('las respuestas de menos de 8 palabras nunca cuentan como lectura', () => {
    assert.equal(contencion('Elegimos el patrón Observer porque', TRABAJO), 0);
  });

  test('textos vacíos o ausentes no rompen el cálculo', () => {
    assert.equal(contencion('', TRABAJO), 0);
    assert.equal(contencion(undefined, undefined), 0);
  });
});

describe('muletillas de duda', () => {
  test('detecta las muletillas con y sin tildes', () => {
    for (const t of ['Creo que sí', 'tal vez funcione', 'Quizás', 'no estoy segura', 'Supongo que va', 'No sé bien', 'diría que es así']) {
      assert.equal(esDubitativo(t), true, t);
    }
  });

  test('no marca palabras parecidas ni respuestas firmes', () => {
    for (const t of ['Creó una clase nueva', 'La creencia era otra', 'Es así porque desacopla', '', undefined]) {
      assert.equal(esDubitativo(t), false, String(t));
    }
  });
});
