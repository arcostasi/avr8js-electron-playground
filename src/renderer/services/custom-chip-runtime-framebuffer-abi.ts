import type { RuntimeAbiContext, RuntimeImportModule } from './custom-chip-runtime-compat';

export function installFramebufferRuntimeAbi(
    importName: string,
    mod: RuntimeImportModule,
    context: RuntimeAbiContext,
): boolean {
    switch (importName) {
        case 'framebuffer_init':
            mod[importName] = (pixelWidthPtr: number, pixelHeightPtr: number) => {
                context.writeU32(pixelWidthPtr, context.state.framebuffer.width);
                context.writeU32(pixelHeightPtr, context.state.framebuffer.height);
                return context.state.framebuffer.handle;
            };
            return true;

        case 'buffer_write':
            mod[importName] = (bufferHandle: number, offset: number, dataPtr: number, dataLen: number) => {
                if (bufferHandle !== context.state.framebuffer.handle) return;
                const mem = context.getMemory();
                if (!mem) return;
                const src = new Uint8Array(mem.buffer, dataPtr, dataLen);
                const start = Math.max(0, Math.trunc(offset));
                const end = Math.min(context.state.framebuffer.bytes.length, start + src.length);
                context.state.framebuffer.bytes.set(src.subarray(0, Math.max(0, end - start)), start);
                context.state.framebuffer.dirty = true;
            };
            return true;

        case 'buffer_read':
            mod[importName] = (bufferHandle: number, offset: number, dataPtr: number, dataLen: number) => {
                if (bufferHandle !== context.state.framebuffer.handle) return;
                const mem = context.getMemory();
                if (!mem) return;
                const dst = new Uint8Array(mem.buffer, dataPtr, dataLen);
                const start = Math.max(0, Math.trunc(offset));
                const end = Math.min(context.state.framebuffer.bytes.length, start + dataLen);
                dst.fill(0);
                dst.set(context.state.framebuffer.bytes.subarray(start, end), 0);
            };
            return true;

        case 'printf':
            mod[importName] = () => {
                context.onChipLog?.('[chip] printf() called (MVP runtime stub)\n');
                return 0;
            };
            return true;

        default:
            return false;
    }
}