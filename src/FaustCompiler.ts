import type { ILibFaust } from "./LibFaust";
import type { FaustDspFactory, IntVector } from "./types";

const sha256 = async (str: string) => {
    if (typeof crypto !== "undefined" && crypto?.subtle) { // Web
        const inputBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest("SHA-256", inputBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        return hashHex;
    }
    // Node.js
    const crypto_node = await import("crypto");
    return crypto_node.createHash("sha256").update(str).digest("hex");
};

export interface IFaustCompiler {
    /**
     * Gives the Faust compiler version.
     * @return a version string
     */
    version(): string;

    /**
     * Gives the last compilation error.
     * @return an error string
     */
    getErrorMessage(): string;

    /**
     * Create a wasm factory from Faust code i.e. wasm compiled code, to be used to create monophonic instances. 
     * This function is running asynchronously.
     *
     * @param name - an arbitrary name for the Faust factory
     * @param code - Faust dsp code
     * @param args - the compiler options
     * @returns returns the wasm factory
     */
    createMonoDSPFactory(name: string, code: string, args: string): Promise<FaustDspFactory | null>;

    /**
     * Create a wasm factory from Faust code i.e. wasm compiled code, to be used to create polyphonic instances. 
     * This function is running asynchronously.
     *
     * @param name - an arbitrary name for the Faust factory
     * @param code - Faust dsp code
     * @param args - the compiler options
     * @returns returns the wasm factory
     */
    createPolyDSPFactory(name: string, code: string, args: string): Promise<FaustDspFactory | null>;

    /**
     * Delete a dsp factory.
     *
     * @param factory - the factory to be deleted
     */
    deleteDSPFactory(factory: FaustDspFactory): void;

    /**
     * Expand Faust code i.e. linearize included libraries.
     *
     * @param code - Faust dsp code
     * @param args - the compiler options
     * @returns returns the expanded dsp code
     */
    expandDSP(code: string, args: string): string | null;

    /**
     * Generates auxiliary files from Faust code. The output depends on the compiler options.
     *
     * @param name - an arbitrary name for the Faust module
     * @param code - Faust dsp code
     * @param args - the compiler options
     * @returns whether the generation actually succeded
     */
    generateAuxFiles(name: string, code: string, args: string): boolean;

    /**
     * Delete all factories.
     */
    deleteAllDSPFactories(): void;

    fs(): typeof FS;

    getAsyncInternalMixerModule(isDouble?: boolean): Promise<{ mixerBuffer: Uint8Array; mixerModule: WebAssembly.Module }>;
    getSyncInternalMixerModule(isDouble?: boolean): { mixerBuffer: Uint8Array; mixerModule: WebAssembly.Module };
}

class FaustCompiler implements IFaustCompiler {
    private fLibFaust: ILibFaust;
    private fErrorMessage: string;
    private static gFactories: Map<string, FaustDspFactory> = new Map<string, FaustDspFactory>();
    private mixer32Buffer!: Uint8Array;
    private mixer64Buffer!: Uint8Array;
    private mixer32Module!: WebAssembly.Module;
    private mixer64Module!: WebAssembly.Module;

    constructor(libFaust: ILibFaust) {
        this.fLibFaust = libFaust;
        this.fErrorMessage = "";
    }
    private intVec2intArray(vec: IntVector) {
        const size = vec.size();
        const ui8Code = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            ui8Code[i] = vec.get(i);
        }
        return ui8Code;
    }
    private async createDSPFactory(name: string, code: string, args: string, poly: boolean) {
        // Cleanup the cache
        if (FaustCompiler.gFactories.size > 10) {
            FaustCompiler.gFactories.clear();
        }

        // If code is already compiled, return the cached factory
        let shaKey = await sha256(name + code + args + (poly ? "poly" : "mono"));
        if (FaustCompiler.gFactories.has(shaKey)) {
            return FaustCompiler.gFactories.get(shaKey) || null;
        } else {
            try {
                // Can possibly raise a C++ exception catched by the second catch()
                const faustWasm = this.fLibFaust.createDSPFactory(name, code, args, !poly);
                try {
                    const code = this.intVec2intArray(faustWasm.data);
                    faustWasm.data.delete();
                    const module = await WebAssembly.compile(code);
                    const factory = { cfactory: faustWasm.cfactory, code, module, json: faustWasm.json, poly }
                    // Factory C++ side can be deallocated immediately
                    this.deleteDSPFactory(factory);
                    // Keep the compiled factory in the cache
                    FaustCompiler.gFactories.set(shaKey, factory);
                    return factory;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            } catch {
                this.fErrorMessage = this.fLibFaust.getErrorAfterException();
                console.error(`=> exception raised while running createDSPFactory: ${this.fErrorMessage}`);
                this.fLibFaust.cleanupAfterException();
                return null;
            }
        }
    }
    version() {
        return this.fLibFaust.version();
    }
    getErrorMessage() {
        return this.fErrorMessage;
    }
    async createMonoDSPFactory(name: string, code: string, args: string) {
        return this.createDSPFactory(name, code, args, false);
    }

    async createPolyDSPFactory(name: string, code: string, args: string) {
        return this.createDSPFactory(name, code, args, true);
    }
    deleteDSPFactory(factory: FaustDspFactory) {
        this.fLibFaust.deleteDSPFactory(factory.cfactory);
        factory.cfactory = 0;
    }
    expandDSP(code: string, args: string) {
        try {
            return this.fLibFaust.expandDSP("FaustDSP", code, args);
        } catch {
            this.fErrorMessage = this.fLibFaust.getErrorAfterException();
            console.error(`=> exception raised while running expandDSP: ${this.fErrorMessage}`);
            this.fLibFaust.cleanupAfterException();
            return null;
        }
    }
    generateAuxFiles(name: string, code: string, args: string) {
        try {
            return this.fLibFaust.generateAuxFiles(name, code, args);
        } catch {
            this.fErrorMessage = this.fLibFaust.getErrorAfterException();
            console.error(`=> exception raised while running generateAuxFiles: ${this.fErrorMessage}`);
            this.fLibFaust.cleanupAfterException();
            return false;
        }
    }
    deleteAllDSPFactories(): void {
        this.fLibFaust.deleteAllDSPFactories();
    }
    fs() {
        return this.fLibFaust.fs();
    }
    async getAsyncInternalMixerModule(isDouble = false) {
        const bufferKey = isDouble ? "mixer64Buffer" : "mixer32Buffer";
        const moduleKey = isDouble ? "mixer64Module" : "mixer32Module";
        if (this[moduleKey]) return { mixerBuffer: this[bufferKey], mixerModule: this[moduleKey] };
        const path = isDouble ? "/usr/rsrc/mixer64.wasm" : "/usr/rsrc/mixer32.wasm";
        const mixerBuffer = this.fs().readFile(path, { encoding: "binary" });
        this[bufferKey] = mixerBuffer;
        // Compile mixer
        const mixerModule = await WebAssembly.compile(mixerBuffer);
        this[moduleKey] = mixerModule;
        return { mixerBuffer, mixerModule };
    }
    getSyncInternalMixerModule(isDouble = false) {
        const bufferKey = isDouble ? "mixer64Buffer" : "mixer32Buffer";
        const moduleKey = isDouble ? "mixer64Module" : "mixer32Module";
        if (this[moduleKey]) return { mixerBuffer: this[bufferKey], mixerModule: this[moduleKey] };
        const path = isDouble ? "/usr/rsrc/mixer64.wasm" : "/usr/rsrc/mixer32.wasm";
        const mixerBuffer = this.fs().readFile(path, { encoding: "binary" });
        this[bufferKey] = mixerBuffer;
        // Compile mixer
        const mixerModule = new WebAssembly.Module(mixerBuffer);
        this[moduleKey] = mixerModule;
        return { mixerBuffer, mixerModule };
    }
}

export default FaustCompiler;
