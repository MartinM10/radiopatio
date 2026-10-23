import assert from 'node:assert';
import test from 'node:test';
import { checkText } from '../lib/privacy';

test('Privacy filter allows valid citizen reports', () => {
  const validCases = [
    'Han roto una ventana en la entrada del portal esta madrugada.',
    'Bicicleta de montaña sustraída del aparcabicis público.',
    'Mucho ruido y cristales rotos en el parque infantil.',
    'Intento de forzar la cerradura de un trastero comunitario.',
    'Botellón hasta las 3 de la madrugada en la zona deportiva.',
    'Pelea entre dos personas frente al colmado de la esquina.',
  ];

  for (const text of validCases) {
    const error = checkText(text);
    assert.strictEqual(error, null, `Should pass: "${text}", but got error: ${error}`);
  }
});

test('Privacy filter blocks phone numbers', () => {
  assert.ok(checkText('Llamadme al 612345678 si veis algo'));
  assert.ok(checkText('Mi telefono es +34 600 12 34 56'));
  assert.ok(checkText('Pide un bizum al 600 123 456'));
});

test('Privacy filter blocks email addresses', () => {
  assert.ok(checkText('Escribid a contacto@ejemplo.com'));
});

test('Privacy filter blocks license plates', () => {
  assert.ok(checkText('El coche con matricula 1234-BCD se dio a la fuga'));
  assert.ok(checkText('Matricula 9876 XYZ aparcado mal'));
  assert.ok(checkText('Furgoneta con matricula antigua M-123456'));
});

test('Privacy filter blocks Spanish DNI / NIE', () => {
  assert.ok(checkText('Su DNI es 12345678Z'));
  assert.ok(checkText('Documento X1234567L'));
});

test('Privacy filter blocks bank and card numbers', () => {
  assert.ok(checkText('Dijo que el IBAN ES91 2100 0418 4502 0005 1332 era su sueldo'));
  assert.ok(checkText('Se quedó con la tarjeta 4539 1488 0343 6467'));
});

test('Privacy filter blocks links / URLs', () => {
  assert.ok(checkText('Mirad la foto en https://ejemplo.com/foto.jpg'));
  assert.ok(checkText('Entrad en www.sitio.com para mas info'));
});

test('Privacy filter blocks hate speech and ethnic origin profiling', () => {
  assert.ok(checkText('Eran unos moros por la esquina'));
  assert.ok(checkText('Habia un grupo de gitanos'));
  assert.ok(checkText('Inmigrantes ilegales rondando'));
});

test('Privacy filter blocks direct person identification', () => {
  assert.ok(checkText('El sospechoso se llama Juan Garcia'));
  assert.ok(checkText('Es el vecino que vive en el 3 B'));
  assert.ok(checkText('Su casa es la del portal 4'));
});

test('Privacy filter blocks incitement to violence (variantes incluidas)', () => {
  assert.ok(checkText('Hay que linchar al que lo ha hecho'));
  assert.ok(checkText('A ver si los matadlos a todos'));
  assert.ok(checkText('Hay que lincharlos esta misma noche'));
  assert.ok(checkText('Me pide que vayamos a quemar la casa'));
  assert.ok(checkText('Que no sea lincharlo en la plaza, por favor'));
});
