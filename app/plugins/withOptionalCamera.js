// expo-image-picker declara el permiso CAMERA, y Android entonces da por hecho que la
// app EXIGE cámara y autoenfoque: Google Play retira del catálogo los dispositivos que no
// los tienen (Chromebooks, coches, algunas tablets y TV). La foto de un aviso es opcional
// y se puede elegir de la galería, así que la cámara se declara como no obligatoria.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.camera', 'android.hardware.camera.autofocus'];

module.exports = function withOptionalCamera(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    for (const name of FEATURES) {
      const found = manifest['uses-feature'].find((f) => f.$['android:name'] === name);
      if (found) found.$['android:required'] = 'false';
      else manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return cfg;
  });
};
