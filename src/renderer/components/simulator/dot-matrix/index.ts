export { default as DotMatrixPart } from './DotMatrixPart';
export {
    DOT_MATRIX_BORDER,
    DOT_MATRIX_LIMITS,
    DOT_MATRIX_MIN_INNER_WIDTH,
    DOT_MATRIX_PADDING,
    DOT_MATRIX_PART_TYPE,
    DOT_MATRIX_PIN_BAR_HEIGHT,
    DOT_MATRIX_PROPERTY_DEFS,
    computeDotMatrixGeometry,
    computeDotMatrixLedAppearance,
    decodeWs2812Grb,
    getDotMatrixPixelCount,
    resolveDotMatrixConfig,
    serializeDotMatrixConfig,
} from './dot-matrix-config';
export type {
    DotMatrixConfig,
    DotMatrixGeometry,
    DotMatrixHostElement,
    DotMatrixLedAppearance,
} from './dot-matrix-config';
