import type { FaustMonoDspInstance, FaustPolyDspInstance, IFaustDspInstance } from "./FaustDspInstance";
import type { FaustDspMeta, FaustUIDescriptor, FaustUIGroup, FaustUIInputItem, FaustUIItem } from "./types";

// Public API
export type OutputParamHandler = (path: string, value: number) => void;
export type ComputeHandler = (buffer_size: number) => void;
export type PlotHandler = (plotted: Float32Array[], index: number, events?: { type: string; data: any }[]) => void;
export type MetadataHandler = (key: string, value: string) => void;

// Implementation API
export type UIHandler = (item: FaustUIItem) => void;

/**
 * DSP implementation: mimic the C++ 'dsp' class:
 * - adding MIDI control: metadata are decoded and incoming MIDI messages will control the associated controllers
 * - an output handler can be set to treat produced output controllers (like 'bargraph')
 * - regular controllers are handled using setParamValue/getParamValue
 */
export interface IFaustBaseWebAudioDsp {
    /**
     * Set the parameter output handler, to  be called in the 'compute' method with output parameters (like bargraph).
     *
     * @param handler - the output handler
     */
    setOutputParamHandler(handler: OutputParamHandler | null): void;

    /**
     * Get the parameter output handler.
     *
     * @return the current output handler
     */
    getOutputParamHandler(): OutputParamHandler | null;

    /**
     * Set the compute handler, to  be called in the 'compute' method with buffer size.
     *
     * @param handler - the compute handler
     */
    setComputeHandler(handler: ComputeHandler | null): void;

    /**
     * Get the compute handler.
     *
     * @return the current output handler
     */
    getComputeHandler(): ComputeHandler | null;

    /**
     * Set the plot handler, to  be called in the 'compute' method with various info (see PlotHandler type).
     *
     * @param handler - the plot handler
     */
    setPlotHandler(handler: PlotHandler | null): void;

    /**
     * Get the plot handler.
     *
     * @return the current plot handler
     */
    getPlotHandler(): PlotHandler | null;

    /**
     * Return instance number of audio inputs.
     *
     * @return the instance number of audio inputs
     */
    getNumInputs(): number;

    /**
     * Return instance number of audio outputs.
     *
     * @return the instance number of audio outputs
     */
    getNumOutputs(): number;

    /**
     * DSP instance computation, to be called with successive input/output audio buffers, using their size.
     *
     * @param inputs - the input audio buffers
     * @param outputs - the output audio buffers
     */
    compute(inputs: Float32Array[], outputs: Float32Array[]): boolean;

    /**
     * Give a handler to be called on 'declare key value' kind of metadata.
     *
     * @param handler - the handler to be used
     */
    metadata(handler: MetadataHandler): void;

    /**
     * Handle untyped MIDI messages.
     *
     * @param data - and arry of MIDI bytes
     */
    midiMessage(data: number[] | Uint8Array): void;

    /**
     * Handle MIDI ctrlChange messages.
     *
     * @param channel - the MIDI channel (0..15, not used for now)
     * @param ctrl - the MIDI controller number (0..127)
     * @param value - the MIDI controller value (0..127)
     */
    ctrlChange(chan: number, ctrl: number, value: number): void;

    /**
     * Handle MIDI pitchWheel messages.
     *
     * @param channel - the MIDI channel (0..15, not used for now)
     * @param value - the MIDI controller value (0..16383)
     */
    pitchWheel(chan: number, value: number): void;

    /**
     * Set parameter value.
     *
     * @param path - the path to the wanted parameter (retrieved using 'getParams' method)
     * @param val - the float value for the wanted control
     */
    setParamValue(path: string, value: number): void;

    /**
     * Get parameter value.
     *
     * @param path - the path to the wanted parameter (retrieved using 'getParams' method)
     *
     * @return the float value
     */
    getParamValue(path: string): number;

    /**
     * Get the table of all input parameters paths.
     *
     * @return the table of all input parameters paths
     */
    getParams(): string[];

    /**
     * Get DSP JSON description with its UI and metadata as object.
     *
     * @return the DSP JSON description as object
     */
    getMeta(): FaustDspMeta;

    /**
     * Get DSP JSON description with its UI and metadata.
     *
     * @return the DSP JSON description
     */
    getJSON(): string;

    /**
     * Get DSP UI description.
     *
     * @return the DSP UI description
     */
    getUI(): FaustUIDescriptor;

    /**
    * Get DSP UI items description.
    *
    * @return the DSP UI items description
    */
    getDescriptors(): FaustUIInputItem[];

    /**
     * Start the DSP.
     */
    start(): void;

    /**
     * Stop the DSP.
     */
    stop(): void;

    /**
     * Destroy the DSP.
     */
    destroy(): void;
}

export interface IFaustMonoWebAudioDsp extends IFaustBaseWebAudioDsp {}
export interface IFaustMonoWebAudioNode extends IFaustMonoWebAudioDsp, AudioNode {}

export interface IFaustPolyWebAudioDsp extends IFaustBaseWebAudioDsp {
    /**
     * Handle MIDI keyOn messages.
     *
     * @param channel - the MIDI channel (0..15, not used for now)
     * @param pitch - the MIDI pitch value (0..127)
     * @param velocity - the MIDI velocity value (0..127)
     */
    keyOn(channel: number, pitch: number, velocity: number): void;

    /**
     * Handle MIDI keyOff messages.
     *
     * @param channel - the MIDI channel (0..15, not used for now)
     * @param pitch - the MIDI pitch value (0..127)
     * @param velocity - the MIDI velocity value (0..127)
     */
    keyOff(channel: number, pitch: number, velocity: number): void;

    /**
     * Stop all playing notes.
     *
     * @param hard - whether to immediately stop notes or put them in release mode
     */
    allNotesOff(hard: boolean): void;
}
export interface IFaustPolyWebAudioNode extends IFaustPolyWebAudioDsp, AudioNode {}

export class FaustBaseWebAudioDsp implements IFaustBaseWebAudioDsp {
    protected fOutputHandler: OutputParamHandler | null;
    protected fComputeHandler: ComputeHandler | null;

    // To handle MIDI events plot
    protected fPlotHandler: PlotHandler | null;
    protected fCachedEvents: { type: string; data: any }[];
    protected fBufferNum: number;

    protected fInChannels: Float32Array[] | Float64Array[];
    protected fOutChannels: Float32Array[] | Float64Array[];

    protected fOutputsTimer: number;

    // UI items path
    protected fInputsItems: string[];
    protected fOutputsItems: string[];
    protected fDescriptor: FaustUIInputItem[];

    // Buffers in wasm memory
    protected fAudioInputs!: number;
    protected fAudioOutputs!: number;

    protected fBufferSize: number;
    protected gPtrSize: number;
    protected gSampleSize: number;

    // MIDI handling
    protected fPitchwheelLabel: { path: string; min: number; max: number }[];
    protected fCtrlLabel: { path: string; min: number; max: number }[][];
    protected fPathTable: { [address: string]: number };
    protected fUICallback: UIHandler;

    protected fProcessing: boolean;

    protected fDestroyed: boolean;

    protected fJSONDsp!: FaustDspMeta;

    constructor(sampleSize: number, bufferSize: number) {
        this.fOutputHandler = null;
        this.fComputeHandler = null;

        // To handle MIDI events plot
        this.fCachedEvents = [];
        this.fBufferNum = 0;
        this.fPlotHandler = null;

        this.fBufferSize = bufferSize;

        this.fInChannels = [];
        this.fOutChannels = [];

        this.gPtrSize = sampleSize; // Done on wast/wasm backend side
        this.gSampleSize = sampleSize;

        this.fOutputsTimer = 5;
        this.fInputsItems = [];
        this.fOutputsItems = [];
        this.fDescriptor = [];

        this.fPitchwheelLabel = [];
        this.fCtrlLabel = new Array(128).fill(null).map(() => []);
        this.fPathTable = {};

        this.fProcessing = false;
        this.fDestroyed = false;

        this.fUICallback = (item: FaustUIItem) => {
            if (item.type === "hbargraph" || item.type === "vbargraph") {
                // Keep bargraph adresses
                this.fOutputsItems.push(item.address);
                this.fPathTable[item.address] = item.index;
            } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
                // Keep inputs adresses
                this.fInputsItems.push(item.address);
                this.fPathTable[item.address] = item.index;
                this.fDescriptor.push(item);
                // Parse 'midi' metadata
                if (!item.meta) return;
                item.meta.forEach((meta) => {
                    const { midi } = meta;
                    if (!midi) return;
                    const strMidi = midi.trim();
                    if (strMidi === "pitchwheel") {
                        this.fPitchwheelLabel.push({ path: item.address, min: item.min as number, max: item.max as number });
                    } else {
                        const matched = strMidi.match(/^ctrl\s(\d+)/);
                        if (!matched) return;
                        this.fCtrlLabel[parseInt(matched[1])].push({ path: item.address, min: item.min as number, max: item.max as number });
                    }
                });
            }
        }
    }

    // Tools
    static remap(v: number, mn0: number, mx0: number, mn1: number, mx1: number) {
        return (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;
    }

    // JSON parsing functions
    static parseUI(ui: FaustUIDescriptor, callback: (...args: any[]) => any) {
        ui.forEach(group => this.parseGroup(group, callback));
    }

    static parseGroup(group: FaustUIGroup, callback: (...args: any[]) => any) {
        if (group.items) {
            this.parseItems(group.items, callback);
        }
    }
    static parseItems(items: FaustUIItem[], callback: (...args: any[]) => any) {
        items.forEach(item => this.parseItem(item, callback));
    }

    static parseItem(item: FaustUIItem, callback: (...args: any[]) => any) {
        if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
            this.parseItems(item.items, callback);
        } else {
            callback(item);
        }
    }

    protected updateOutputs() {
        if (this.fOutputsItems.length > 0 && this.fOutputHandler && this.fOutputsTimer-- === 0) {
            this.fOutputsTimer = 5;
            this.fOutputsItems.forEach(item => this.fOutputHandler?.(item, this.getParamValue(item)));
        }
    }

    // Public API
    metadata(handler: MetadataHandler) {
        if (this.fJSONDsp.meta) {
            this.fJSONDsp.meta.forEach(meta => handler(Object.keys(meta)[0], meta[Object.keys(meta)[0]]));
        }
    }

    compute(input: Float32Array[], output: Float32Array[]) {
        return false;
    }

    setOutputParamHandler(handler: OutputParamHandler | null) {
        this.fOutputHandler = handler;
    }
    getOutputParamHandler() {
        return this.fOutputHandler;
    }

    setComputeHandler(handler: ComputeHandler | null) {
        this.fComputeHandler = handler;
    }
    getComputeHandler() {
        return this.fComputeHandler;
    }

    setPlotHandler(handler: PlotHandler | null) {
        this.fPlotHandler = handler;
    }
    getPlotHandler() {
        return this.fPlotHandler;
    }

    getNumInputs() {
        return -1;
    }
    getNumOutputs() {
        return -1;
    }

    midiMessage(data: number[] | Uint8Array) {
        if (this.fPlotHandler) this.fCachedEvents.push({ data, type: "midi" });
        const cmd = data[0] >> 4;
        const channel = data[0] & 0xf;
        const data1 = data[1];
        const data2 = data[2];
        if (cmd === 11) return this.ctrlChange(channel, data1, data2);
        if (cmd === 14) return this.pitchWheel(channel, (data2 * 128.0 + data1));
    }

    ctrlChange(channel: number, ctrl: number, value: number) {
        if (this.fPlotHandler) this.fCachedEvents.push({ type: "ctrlChange", data: [channel, ctrl, value] });
        if (this.fCtrlLabel[ctrl].length) {
            this.fCtrlLabel[ctrl].forEach((ctrl) => {
                const { path } = ctrl;
                this.setParamValue(path, FaustBaseWebAudioDsp.remap(value, 0, 127, ctrl.min, ctrl.max));
                // Typically used to reflect parameter change on GUI
                if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
            });
        }
    }

    pitchWheel(channel: number, wheel: number) {
        if (this.fPlotHandler) this.fCachedEvents.push({ type: "pitchWheel", data: [channel, wheel] });
        this.fPitchwheelLabel.forEach((pw) => {
            this.setParamValue(pw.path, FaustBaseWebAudioDsp.remap(wheel, 0, 16383, pw.min, pw.max));
            // Typically used to reflect parameter change on GUI
            if (this.fOutputHandler) this.fOutputHandler(pw.path, this.getParamValue(pw.path));
        });
    }

    setParamValue(path: string, value: number) { }
    getParamValue(path: string) { return 0; }

    getParams() { return this.fInputsItems; }
    getMeta() { return this.fJSONDsp; }
    getJSON() { return JSON.stringify(this.getMeta()); }
    getUI() { return this.fJSONDsp.ui; }
    getDescriptors() { return this.fDescriptor; }

    start() {
        this.fProcessing = true;
    }

    stop() {
        this.fProcessing = false;
    }

    destroy() {
        this.fDestroyed = true;
        this.fOutputHandler = null;
        this.fComputeHandler = null;
        this.fPlotHandler = null;
    }
}

export class FaustMonoWebAudioDsp extends FaustBaseWebAudioDsp implements IFaustMonoWebAudioDsp {

    private fInstance: FaustMonoDspInstance;
    private fDSP!: number;

    constructor(instance: FaustMonoDspInstance, sampleRate: number, sampleSize: number, bufferSize: number) {

        super(sampleSize, bufferSize);
        this.fInstance = instance;

        // Create JSON object
        this.fJSONDsp = JSON.parse(this.fInstance.json);

        // Setup GUI
        FaustBaseWebAudioDsp.parseUI(this.fJSONDsp.ui, this.fUICallback);

        // Setup wasm memory
        this.initMemory();

        // Init DSP
        this.fInstance.api.init(this.fDSP, sampleRate);
    }

    private initMemory() {

        // Start of DSP memory: Mono DSP is placed first with index 0
        this.fDSP = 0;

        // Audio buffer start at the end of DSP
        const $audio = this.fJSONDsp.size;

        // Setup audio pointers offset
        this.fAudioInputs = $audio;
        this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.gPtrSize;

        // Prepare wasm memory layout
        const $audioInputs = this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize;
        const $audioOutputs = $audioInputs + this.getNumInputs() * this.fBufferSize * this.gSampleSize;

        const HEAP = this.fInstance.memory.buffer;
        const HEAP32 = new Int32Array(HEAP);
        const HEAPF = (this.gSampleSize === 4) ? new Float32Array(HEAP) : new Float64Array(HEAP);

        if (this.getNumInputs() > 0) {
            for (let chan = 0; chan < this.getNumInputs(); chan++) {
                HEAP32[(this.fAudioInputs >> 2) + chan] = $audioInputs + this.fBufferSize * this.gSampleSize * chan;
            }
            // Prepare Ins buffer tables
            const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, (this.fAudioInputs + this.getNumInputs() * this.gPtrSize) >> 2);
            for (let chan = 0; chan < this.getNumInputs(); chan++) {
                this.fInChannels[chan] = HEAPF.subarray(dspInChans[chan] >> Math.log2(this.gSampleSize), (dspInChans[chan] + this.fBufferSize * this.gSampleSize) >> Math.log2(this.gSampleSize));
            }
        }
        if (this.getNumOutputs() > 0) {
            for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                HEAP32[(this.fAudioOutputs >> 2) + chan] = $audioOutputs + this.fBufferSize * this.gSampleSize * chan;
            }
            // Prepare Out buffer tables
            const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, (this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize) >> 2);
            for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                this.fOutChannels[chan] = HEAPF.subarray(dspOutChans[chan] >> Math.log2(this.gSampleSize), (dspOutChans[chan] + this.fBufferSize * this.gSampleSize) >> Math.log2(this.gSampleSize));
            }
        }
    }

    toString() {
        return `============== Mono Memory layout ==============
this.fBufferSize: ${this.fBufferSize}
this.fJSONDsp.size: ${this.fJSONDsp.size}
this.fAudioInputs: ${this.fAudioInputs}
this.fAudioOutputs: ${this.fAudioOutputs}
this.fDSP: ${this.fDSP}`;
    }

    // Public API
    compute(input: Float32Array[], output: Float32Array[]) {

        // Check DSP state
        if (this.fDestroyed) return false;

        // Check Processing state: the node returns 'true' to stay in the graph, even if not processing
        if (!this.fProcessing) return true;

        // Check inputs
        if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
            // console.log("Process input error");
            return true;
        }

        // Check outputs
        if (this.getNumOutputs() > 0 && (!output || !output[0] || output[0].length === 0)) {
            // console.log("Process output error");
            return true;
        }

        // Copy inputs
        if (input !== undefined) {
            for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); ++chan) {
                const dspInput = this.fInChannels[chan];
                dspInput.set(input[chan]);
            }
        }

        // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
        if (this.fComputeHandler) this.fComputeHandler(this.fBufferSize);

        // Compute
        this.fInstance.api.compute(this.fDSP, this.fBufferSize, this.fAudioInputs, this.fAudioOutputs);

        // Update bargraph
        this.updateOutputs();

        if (output !== undefined) {
            // Copy outputs
            for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
                const dspOutput = this.fOutChannels[chan];
                output[chan].set(dspOutput);
            }
            // PlotHandler handling
            if (this.fPlotHandler) {
                this.fPlotHandler(output, this.fBufferNum++, (this.fCachedEvents.length ? this.fCachedEvents : undefined));
                this.fCachedEvents = [];
            }
        }

        return true;
    }

    metadata(handler: MetadataHandler) { super.metadata(handler); }

    getNumInputs() {
        return this.fInstance.api.getNumInputs(this.fDSP);
    }
    getNumOutputs() {
        return this.fInstance.api.getNumOutputs(this.fDSP);
    }

    setParamValue(path: string, value: number) {
        if (this.fPlotHandler) this.fCachedEvents.push({ type: "param", data: { path, value } });
        this.fInstance.api.setParamValue(this.fDSP, this.fPathTable[path], value);
    }
    getParamValue(path: string) {
        return this.fInstance.api.getParamValue(this.fDSP, this.fPathTable[path]);
    }

    getMeta() { return this.fJSONDsp; }
    getJSON() { return this.fInstance.json; }
    getDescriptors() { return this.fDescriptor; }
    getUI() { return this.fJSONDsp.ui; }
}


// Voice management
interface TransformFunction { (val: number): number }

export class FaustWebAudioDspVoice {

    static kActiveVoice: number;
    static kFreeVoice: number;
    static kReleaseVoice: number;
    static kLegatoVoice: number;
    static kNoVoice: number;
    static VOICE_STOP_LEVEL: number;
    private fFreqLabel: number[];
    private fGateLabel: number[];
    private fGainLabel: number[];
    private fDSP: number;         // Voice DSP location in wasm memory
    private fAPI: IFaustDspInstance; // Voice DSP code
    private fKeyFun: TransformFunction;
    private fVelFun: TransformFunction;
    // Accessed by PolyDSPImp class
    fCurNote: number;
    // The timestamp at which the next note start/end should occur. If 0, then it should
    // start immediately. If `undefined`, no note start/end is queued.
    fNoteStartTimestamp: number | undefined;
    fNoteEndTimestamp: number | undefined;
    fNextNote: number;
    fNextVel: number;
    fDate: number;
    fLevel: number;
    fRelease: number;

    constructor($dsp: number, api: IFaustDspInstance, inputItems: string[], pathTable: { [address: string]: number }, sampleRate: number) {
        // Voice state
        FaustWebAudioDspVoice.kActiveVoice = 0;
        FaustWebAudioDspVoice.kFreeVoice = -1;
        FaustWebAudioDspVoice.kReleaseVoice = -2;
        FaustWebAudioDspVoice.kLegatoVoice = -3;
        FaustWebAudioDspVoice.kNoVoice = -4;
        FaustWebAudioDspVoice.VOICE_STOP_LEVEL = 0.0005;
        // Default versions
        this.fKeyFun = (pitch: number) => FaustWebAudioDspVoice.midiToFreq(pitch);
        this.fVelFun = (velocity: number) => velocity / 127.0;
        this.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
        this.fNoteStartTimestamp = undefined;
        this.fNoteEndTimestamp = undefined;
        this.fNextNote = this.fNextVel = -1;
        this.fLevel = 0;
        this.fDate = this.fRelease = 0;
        this.fDSP = $dsp;
        this.fAPI = api;
        this.fGateLabel = [];
        this.fGainLabel = [];
        this.fFreqLabel = [];
        this.fAPI.init(this.fDSP, sampleRate);
        this.extractPaths(inputItems, pathTable);
    }

    static midiToFreq(note: number) { return 440.0 * 2 ** ((note - 69) / 12); }

    private extractPaths(inputItems: string[], pathTable: { [address: string]: number }) {
        inputItems.forEach((item) => {
            if (item.endsWith("/gate")) {
                this.fGateLabel.push(pathTable[item]);
            } else if (item.endsWith("/freq")) {
                this.fKeyFun = (pitch: number) => FaustWebAudioDspVoice.midiToFreq(pitch);
                this.fFreqLabel.push(pathTable[item]);
            } else if (item.endsWith("/key")) {
                this.fKeyFun = (pitch: number) => pitch;
                this.fFreqLabel.push(pathTable[item]);
            } else if (item.endsWith("/gain")) {
                this.fVelFun = (velocity: number) => velocity / 127.0;
                this.fGainLabel.push(pathTable[item]);
            } else if (item.endsWith("/vel") && item.endsWith("/velocity")) {
                this.fVelFun = (velocity: number) => velocity;
                this.fGainLabel.push(pathTable[item]);
            }
        });
    }

    // Public API

    keyOn(pitch: number, velocity: number, legato: boolean = false, timestamp: number = 0) {
        // console.log(timestamp);
        this.fNoteStartTimestamp = timestamp;

        if (legato) {
            this.fNextNote = pitch;
            this.fNextVel = velocity;
        } else {
            this.fFreqLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, this.fKeyFun(pitch)));
            this.fGateLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, 1));
            this.fGainLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, this.fVelFun(velocity)));
            // Keep pitch
            this.fCurNote = pitch;
        }
    }

    keyOff(hard: boolean = false, timestamp: number = 0) {
        this.fNoteEndTimestamp = timestamp;

        this.fGateLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, 0));
        if (hard) {
            this.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
        } else {
            this.fRelease = this.fAPI.getSampleRate(this.fDSP) / 2;
            this.fCurNote = FaustWebAudioDspVoice.kReleaseVoice;
        }
    }

    computeLegato(bufferSize: number, $inputs: number, $outputZero: number, $outputsHalf: number) {

        let size = bufferSize / 2;

        // Reset envelops
        this.fGateLabel.forEach(index => this.fAPI.setParamValue(this.fDSP, index, 0));

        // Compute current voice on half buffer
        this.fAPI.compute(this.fDSP, size, $inputs, $outputZero);

        // Start next keyOn
        this.keyOn(this.fNextNote, this.fNextVel);

        // Compute on second half buffer
        this.fAPI.compute(this.fDSP, size, $inputs, $outputsHalf);
    }

    compute(bufferSize: number, $inputs: number, $outputs: number) {
        this.fAPI.compute(this.fDSP, bufferSize, $inputs, $outputs);
    }

    setParamValue(index: number, value: number) {
        // console.log(3, index,value);
        this.fAPI.setParamValue(this.fDSP, index, value);
    }
    getParamValue(index: number) {
        return this.fAPI.getParamValue(this.fDSP, index);
    }
}

export class FaustPolyWebAudioDsp extends FaustBaseWebAudioDsp implements IFaustPolyWebAudioDsp {

    private fInstance: FaustPolyDspInstance;
    private fEffect!: number;
    private fJSONEffect: FaustDspMeta | null;
    private fAudioMixing!: number;
    private fAudioMixingHalf!: number;
    private fVoiceTable: FaustWebAudioDspVoice[];
    private scheduledEvents: any[];
    private originalMixingBufferPointers: number[];
    private originalOutputBufferPointers: number[];

    constructor(instance: FaustPolyDspInstance, sampleRate: number, sampleSize: number, bufferSize: number, private processor: any) {
        super(sampleSize, bufferSize);
        this.fInstance = instance;

        // Create JSON for voice
        this.fJSONDsp = JSON.parse(this.fInstance.voiceJSON);

        // Create JSON for effect
        this.fJSONEffect = (this.fInstance.effectAPI && this.fInstance.effectJSON) ? JSON.parse(this.fInstance.effectJSON) : null;

        // Setup GUI
        FaustBaseWebAudioDsp.parseUI(this.fJSONDsp.ui, this.fUICallback);
        if (this.fJSONEffect) FaustBaseWebAudioDsp.parseUI(this.fJSONEffect.ui, this.fUICallback);

        // Setup wasm memory
        this.initMemory();

        // Init DSP voices
        this.fVoiceTable = [];
        for (let voice = 0; voice < this.fInstance.voices; voice++) {
            this.fVoiceTable.push(new FaustWebAudioDspVoice(
                this.fJSONDsp.size * voice,
                this.fInstance.voiceAPI,
                this.fInputsItems,
                this.fPathTable,
                sampleRate));
        }

        // Init effect
        if (this.fInstance.effectAPI) this.fInstance.effectAPI.init(this.fEffect, sampleRate);

        this.scheduledEvents = [];
    }

    private initMemory() {

        // Effect start at the end of all DSP voices
        this.fEffect = this.fJSONDsp.size * this.fInstance.voices;

        // Audio buffer start at the end of effect
        const $audio = this.fEffect + (this.fJSONEffect ? this.fJSONEffect.size : 0);

        // Setup audio pointers offset
        this.fAudioInputs = $audio;
        this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.gPtrSize;
        this.fAudioMixing = this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize;
        this.fAudioMixingHalf = this.fAudioMixing + this.getNumOutputs() * this.gPtrSize;

        // Prepare wasm memory layout
        const $audioInputs = this.fAudioMixingHalf + this.getNumOutputs() * this.gPtrSize;
        const $audioOutputs = $audioInputs + this.getNumInputs() * this.fBufferSize * this.gSampleSize;
        const $audioMixing = $audioOutputs + this.getNumOutputs() * this.fBufferSize * this.gSampleSize;

        const HEAP = this.fInstance.memory.buffer;
        const HEAP32 = new Int32Array(HEAP);
        const HEAPF = (this.gSampleSize === 4) ? new Float32Array(HEAP) : new Float64Array(HEAP);

        if (this.getNumInputs() > 0) {
            for (let chan = 0; chan < this.getNumInputs(); chan++) {
                HEAP32[(this.fAudioInputs >> 2) + chan] = $audioInputs + this.fBufferSize * this.gSampleSize * chan;
            }
            // Prepare Ins buffer tables
            const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, (this.fAudioInputs + this.getNumInputs() * this.gPtrSize) >> 2);
            for (let chan = 0; chan < this.getNumInputs(); chan++) {
                this.fInChannels[chan] = HEAPF.subarray(dspInChans[chan] >> Math.log2(this.gSampleSize), (dspInChans[chan] + this.fBufferSize * this.gSampleSize) >> Math.log2(this.gSampleSize));
            }
        }

        this.originalMixingBufferPointers = [];
        this.originalOutputBufferPointers = [];

        if (this.getNumOutputs() > 0) {
            for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                this.originalOutputBufferPointers[chan] = $audioOutputs + this.fBufferSize * this.gSampleSize * chan;
                HEAP32[(this.fAudioOutputs >> 2) + chan] = this.originalOutputBufferPointers[chan];

                this.originalMixingBufferPointers[chan] = $audioMixing + this.fBufferSize * this.gSampleSize * chan;
                HEAP32[(this.fAudioMixing >> 2) + chan] = this.originalMixingBufferPointers[chan];

                HEAP32[(this.fAudioMixingHalf >> 2) + chan] = $audioMixing + this.fBufferSize * this.gSampleSize * chan + this.fBufferSize / 2 * this.gSampleSize;

            }
            // Prepare Out buffer tables
            const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, (this.fAudioOutputs + this.getNumOutputs() * this.gPtrSize) >> 2);
            for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                this.fOutChannels[chan] = HEAPF.subarray(dspOutChans[chan] >> Math.log2(this.gSampleSize), (dspOutChans[chan] + this.fBufferSize * this.gSampleSize) >> Math.log2(this.gSampleSize));
            }
        }

        // TD: we can manipulate like // HEAP32[(this.fAudioMixing >> 2)] += 496;
    }

    toString() {
        return `============== Poly Memory layout ==============
this.fBufferSize: ${this.fBufferSize}
this.fJSONDsp.size: ${this.fJSONDsp.size}
this.fAudioInputs: ${this.fAudioInputs}
this.fAudioOutputs: ${this.fAudioOutputs}
this.fAudioMixing: ${this.fAudioMixing}
this.fAudioMixingHalf: ${this.fAudioMixingHalf}`;
    }

    private allocVoice(voice: number, type: number) {
        this.fVoiceTable[voice].fDate++;
        this.fVoiceTable[voice].fCurNote = type;
        return voice;
    }

    private getPlayingVoice(pitch: number) {
        let voicePlaying = FaustWebAudioDspVoice.kNoVoice;
        let oldestDatePlaying = Number.MAX_VALUE;

        for (let voice = 0; voice < this.fInstance.voices; voice++) {
            if (this.fVoiceTable[voice].fCurNote === pitch) {
                // Keeps oldest playing voice
                if (this.fVoiceTable[voice].fDate < oldestDatePlaying) {
                    oldestDatePlaying = this.fVoiceTable[voice].fDate;
                    voicePlaying = voice;
                }
            }
        }
        return voicePlaying;
    }

    private getFreeVoice() {
        for (let voice = 0; voice < this.fInstance.voices; voice++) {
            if (this.fVoiceTable[voice].fCurNote === FaustWebAudioDspVoice.kFreeVoice) {
                return this.allocVoice(voice, FaustWebAudioDspVoice.kActiveVoice);
            }
        }

        let voiceRelease = FaustWebAudioDspVoice.kNoVoice;
        let voicePlaying = FaustWebAudioDspVoice.kNoVoice;
        let oldestDateRelease = Number.MAX_VALUE;
        let oldestDatePlaying = Number.MAX_VALUE;

        for (let voice = 0; voice < this.fInstance.voices; voice++) { // Scan all voices
            // Try to steal a voice in DspVoice.kReleaseVoice mode...
            if (this.fVoiceTable[voice].fCurNote === FaustWebAudioDspVoice.kReleaseVoice) {
                // Keeps oldest release voice
                if (this.fVoiceTable[voice].fDate < oldestDateRelease) {
                    oldestDateRelease = this.fVoiceTable[voice].fDate;
                    voiceRelease = voice;
                }
            } else if (this.fVoiceTable[voice].fDate < oldestDatePlaying) {
                oldestDatePlaying = this.fVoiceTable[voice].fDate;
                voicePlaying = voice;
            }
        }
        // Then decide which one to steal
        if (oldestDateRelease !== Number.MAX_VALUE) {
            console.log(`Steal release voice : voice_date = ${this.fVoiceTable[voiceRelease].fDate} voice = ${voiceRelease}`);
            return this.allocVoice(voiceRelease, FaustWebAudioDspVoice.kLegatoVoice);
        }
        if (oldestDatePlaying !== Number.MAX_VALUE) {
            console.log(`Steal playing voice : voice_date = ${this.fVoiceTable[voicePlaying].fDate} voice = ${voicePlaying}`);
            return this.allocVoice(voicePlaying, FaustWebAudioDspVoice.kLegatoVoice);
        }
        return FaustWebAudioDspVoice.kNoVoice;
    }

    // Public API
    compute(input: Float32Array[], output: Float32Array[]) {
        const HEAP = this.fInstance.memory.buffer;
        const HEAP32 = new Int32Array(HEAP);

        // Check DSP state
        if (this.fDestroyed) return false;

        // Check Processing state: the node returns 'true' to stay in the graph, even if not processing
        if (!this.fProcessing) return true;

        // Check inputs
        if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
            // console.log("Process input error");
            return true;
        }

        // Check outputs
        if (this.getNumOutputs() > 0 && (!output || !output[0] || output[0].length === 0)) {
            // console.log("Process output error");
            return true;
        }

        // Copy inputs
        if (input !== undefined) {
            for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); ++chan) {
                const dspInput = this.fInChannels[chan];
                dspInput.set(input[chan]);
            }
        }

        // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
        if (this.fComputeHandler) this.fComputeHandler(this.fBufferSize);

        // Compute
        this.fInstance.mixerAPI.clearOutput(this.fBufferSize, this.getNumOutputs(), this.fAudioOutputs);

        const events = [...this.getEventsInCurrentFrame(), null];
        if (events.length) {
            // console.log(events, this.processor.getCurrentTime());
        }
        // const sliceBoundaries = [...events.map(e => e.sampleOffset), this.fBufferSize];
        // const sliceBoundaries = [this.fBufferSize];
        // console.log(sliceBoundaries)

        // console.log('----')
        for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
            const event = events[eventIndex];

            const sliceStart = eventIndex > 0 ? events[eventIndex - 1].sampleOffset : 0;
            const sliceEnd = event === null ? this.fBufferSize : event.sampleOffset;
            const sliceLength = sliceEnd - sliceStart;

            // Offset the buffer pointers for this slice
            if (sliceStart > 0) {
                // console.log({sliceStart,sliceEnd,sliceLength})
                for (let chan = 0; chan < this.getNumOutputs(); chan++) {
                    HEAP32[(this.fAudioOutputs >> 2) + chan] = this.originalOutputBufferPointers[chan] + (sliceStart * this.gSampleSize);
                    HEAP32[(this.fAudioMixing >> 2) + chan] = this.originalMixingBufferPointers[chan] + (sliceStart * this.gSampleSize);
                }
            }

            if (event && event.sampleOffset <0) {
                console.log("negative event",event);
            }

            if (event && event.type === "NOTE_ON") {
                this.keyOn(0, event.data.note, 1);
            } else if (event && event.type === "NOTE_OFF") {
                this.keyOff(0, event.data.note, 1);
            } else if (event && event.type === "PARAMETER_CHANGE") {
                this.setParamValue(event.data.path, event.data.value);
            }

            this.fVoiceTable.forEach((voice) => {
                /*if (voice.fCurNote === FaustWebAudioDspVoice.kLegatoVoice) {
                    // Play from current note and next note
                    voice.computeLegato(this.fBufferSize, this.fAudioInputs, this.fAudioMixing, this.fAudioMixingHalf);
                    // FadeOut on first half buffer
                    this.fInstance.mixerAPI.fadeOut(this.fBufferSize / 2, this.getNumOutputs(), this.fAudioMixing);
                    // Mix it in result
                    voice.fLevel = this.fInstance.mixerAPI.mixCheckVoice(this.fBufferSize, this.getNumOutputs(), this.fAudioMixing, this.fAudioOutputs);
                } else*/ if (voice.fCurNote !== FaustWebAudioDspVoice.kFreeVoice) {
                    // If the note is waiting to start, and the onset occurs within this buffer
                    /*if (voice.fNoteStartTimestamp !== undefined) {
                        const endOfCurrentFrameSecs = this.processor.getCurrentTime() + (this.fBufferSize / this.processor.getSampleRate());

                        if (endOfCurrentFrameSecs > voice.fNoteStartTimestamp) {
                            const samplesUntilStart = (voice.fNoteStartTimestamp * this.processor.getSampleRate()) - (this.processor.getCurrentFrame());
                            console.log(endOfCurrentFrameSecs, voice.fNoteStartTimestamp, this.processor.getCurrentTime(), this.processor.getCurrentFrame());
                            console.log('start in ', samplesUntilStart);
                            voice.fNoteStartTimestamp = undefined;
                        }
                    }*/

                    // Compute current note
                    voice.compute(sliceLength, this.fAudioInputs, this.fAudioMixing);

                    // Mix it in result
                    voice.fLevel = this.fInstance.mixerAPI.mixCheckVoice(sliceLength, this.getNumOutputs(), this.fAudioMixing, this.fAudioOutputs);
                    // Check the level to possibly set the voice in kFreeVoice again
                    voice.fRelease -= sliceLength;
                    if ((voice.fCurNote == FaustWebAudioDspVoice.kReleaseVoice) && ((voice.fLevel < FaustWebAudioDspVoice.VOICE_STOP_LEVEL) && (voice.fRelease < 0))) {
                        voice.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
                    }
                }
            });
        }

        if (this.fInstance.effectAPI) this.fInstance.effectAPI.compute(this.fEffect, this.fBufferSize, this.fAudioOutputs, this.fAudioOutputs);

        // Reset the buffer pointers
        for (let chan = 0; chan < this.getNumOutputs(); chan++) {
            HEAP32[(this.fAudioOutputs >> 2) + chan] = this.originalOutputBufferPointers[chan];
            HEAP32[(this.fAudioMixing >> 2) + chan] = this.originalMixingBufferPointers[chan];
        }

        // Update bargraph
        this.updateOutputs();

        if (output !== undefined) {
            // Copy outputs
            for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
                const dspOutput = this.fOutChannels[chan];
                output[chan].set(dspOutput);
            }

            // PlotHandler handling
            if (this.fPlotHandler) {
                this.fPlotHandler(output, this.fBufferNum++, (this.fCachedEvents.length ? this.fCachedEvents : undefined));
                this.fCachedEvents = [];
            }
        }

        return true;
    }
    getNumInputs() {
        return this.fInstance.voiceAPI.getNumInputs(0);
    }
    getNumOutputs() {
        return this.fInstance.voiceAPI.getNumOutputs(0);
    }

    getEventsInCurrentFrame() {
        const events: any[] = [];
        const currentTime = this.processor.getCurrentTime();
        const sampleRate = this.processor.getSampleRate();
        const endOfCurrentFrameSecs = currentTime + (this.fBufferSize / sampleRate);

        // console.log('----loop----');
        // let i;
        // for (i = 0; i < this.scheduledEvents.length; i++) {
        while(this.scheduledEvents.length && this.scheduledEvents[0].time < endOfCurrentFrameSecs) {
            const event = this.scheduledEvents[0];
            // if (event.time < endOfCurrentFrameSecs) {
                // console.log("dequeue event", event, {currentTime, endOfCurrentFrameSecs})
                const enrichedEvent = this.scheduledEvents.shift();
                enrichedEvent.sampleOffset = Math.round((event.time - currentTime) * sampleRate);
                events.push(enrichedEvent);
                // continue;
            // } else {
            //     console.log('break on ', event);
            //     break;
            // }
        }

        // for (let j = 0; j < i; j++) {
        //     this.scheduledEvents.unshift();
        // }

        return events;
    }

    private static findPath(o: any, p: string) {
        if (typeof o !== "object") {
            return false;
        } else if (o.address) {
            return (o.address === p);
        } else {
            for (const k in o) {
                if (FaustPolyWebAudioDsp.findPath(o[k], p)) return true;
            }
            return false;
        }
    }

    setParamValue(path: string, value: number) {
        // console.log(2,path,value);//,new Error().stack)

        if (this.fPlotHandler) this.fCachedEvents.push({ type: "param", data: { path, value } });
        if (this.fJSONEffect && FaustPolyWebAudioDsp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effectAPI) {
            this.fInstance.effectAPI.setParamValue(this.fEffect, this.fPathTable[path], value);
        } else {
            this.fVoiceTable.forEach(voice => voice.setParamValue(this.fPathTable[path], value));
        }
    }
    getParamValue(path: string) {
        if (this.fJSONEffect && FaustPolyWebAudioDsp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effectAPI) {
            return this.fInstance.effectAPI.getParamValue(this.fEffect, this.fPathTable[path]);
        } else {
            return this.fVoiceTable[0].getParamValue(this.fPathTable[path]);
        }
    }

    getMeta() {
        const o = this.fJSONDsp;
        const e = this.fJSONEffect;
        const r = { ...o };
        if (e) {
            r.ui = [{
                type: "tgroup", label: "Sequencer", items: [
                    { type: "vgroup", label: "Instrument", items: o.ui },
                    { type: "vgroup", label: "Effect", items: e.ui }
                ]
            }];
        } else {
            r.ui = [{
                type: "tgroup", label: "Polyphonic", items: [
                    { type: "vgroup", label: "Voices", items: o.ui }
                ]
            }];
        }
        return r as FaustDspMeta;
    }

    getJSON() {
        return JSON.stringify(this.getMeta());
    }

    getUI() {
        return this.getMeta().ui;
    }

    getDescriptors() { return this.fDescriptor; }

    midiMessage(data: number[] | Uint8Array, timestamp: number = 0) {
        console.log("PLY MIDI")
        const cmd = data[0] >> 4;
        const channel = data[0] & 0xf;
        const data1 = data[1];
        const data2 = data[2];
        if (cmd === 8 || (cmd === 9 && data2 === 0)) return this.keyOff(channel, data1, data2, timestamp);
        else if (cmd === 9) return this.keyOn(channel, data1, data2, timestamp);
        else super.midiMessage(data);
    };

    ctrlChange(channel: number, ctrl: number, value: number) {
        if (ctrl === 123 || ctrl === 120) {
            this.allNotesOff(true);
        } else {
            super.ctrlChange(channel, ctrl, value);
        }
    }

    keyOn(channel: number, pitch: number, velocity: number, timestamp: number = 0) {
        // console.log("KEY ON", timestamp);
        const voice = this.getFreeVoice();
        this.fVoiceTable[voice].keyOn(pitch, velocity, this.fVoiceTable[voice].fCurNote == FaustWebAudioDspVoice.kLegatoVoice, timestamp);
    }

    keyOff(channel: number, pitch: number, velocity: number, timestamp: number = 0) {
        const voice = this.getPlayingVoice(pitch);
        if (voice !== FaustWebAudioDspVoice.kNoVoice) {
            this.fVoiceTable[voice].keyOff(false, timestamp);
        } else {
            console.log("Playing pitch = %d not found\n", pitch);
        }
    }

    scheduleEvent(event: any) {
        console.log('scheudling event', event);
        event.id = this.scheduledEvents.length;
        this.scheduledEvents.push(event);
        this.scheduledEvents.sort((a, b) => a.time - b.time);
        // console.log('scheudling event', event, JSON.stringify(this.scheduledEvents));
    }

    allNotesOff(hard: boolean = true) {
        this.fCachedEvents.push({ type: "ctrlChange", data: [0, 123, 0] });
        this.fVoiceTable.forEach(voice => voice.keyOff(hard));
    }
}
