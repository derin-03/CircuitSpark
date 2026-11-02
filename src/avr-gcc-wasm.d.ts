declare module '@horang-corp/avr-gcc-wasm' {
  export type CompileOptions = {
    source: string;
    sensors: string[];
    assetsBase: string | URL;
  };

  export type CompileResult = {
    hex: string;
    fitsTarget: boolean;
  };

  export function compile(
    options: CompileOptions
  ): Promise<CompileResult>;
}