/// <reference types="vite/client" />

declare interface GlobalThis {
    MonacoEnvironment: {
        getWorker(workerId: string, label: string): Worker;
    };
}

declare module '*?worker' {
    const workerConstructor: {
        new(): Worker;
    };
    export default workerConstructor;
}
