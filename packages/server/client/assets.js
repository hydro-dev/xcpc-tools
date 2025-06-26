import _NotoSansSC from '@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf';
import _wasmBinary from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm';
import _DejaVuSansMono from 'dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf';
import _DejaVuSansMonoBold from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf';
import _DejaVuSansMonoBoldOblique from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-BoldOblique.ttf';
import _DejaVuSansMonoOblique from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Oblique.ttf';
import { decodeBinary } from '../utils';

export const NotoSansSC = decodeBinary(_NotoSansSC);
export const wasmBinary = decodeBinary(_wasmBinary);
export const DejaVuSansMono = decodeBinary(_DejaVuSansMono);
export const DejaVuSansMonoBold = decodeBinary(_DejaVuSansMonoBold);
export const DejaVuSansMonoBoldOblique = decodeBinary(_DejaVuSansMonoBoldOblique);
export const DejaVuSansMonoOblique = decodeBinary(_DejaVuSansMonoOblique);
