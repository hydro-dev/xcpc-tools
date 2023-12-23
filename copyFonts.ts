import path from 'path';
import * as fs from 'fs-extra';

const fontFiles = {
    'DejaVuSansMono.ttf': require.resolve('dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf'),
    'DejaVuSansMono-Bold.ttf': require.resolve('dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf'),
    'DejaVuSansMono-Oblique.ttf': require.resolve('dejavu-fonts-ttf/ttf/DejaVuSansMono-Oblique.ttf'),
    'DejaVuSansMono-BoldOblique.ttf': require.resolve('dejavu-fonts-ttf/ttf/DejaVuSansMono-BoldOblique.ttf'),
    'NotoSansSC_400Regular.ttf': require.resolve('@expo-google-fonts/noto-sans-sc/NotoSansSC_400Regular.ttf'),
};

(async () => {
    fs.ensureDirSync(path.resolve(__dirname, 'assets'));
    for (const font in fontFiles) {
        fs.copyFileSync(path.resolve(__dirname, 'node_modules', fontFiles[font]), path.resolve(__dirname, 'assets', font));
    }
})();
