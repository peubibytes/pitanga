declare module 'pino-roll' {
  interface OpcoesPinoRoll {
    file: string;
    extension?: string;
    frequency?: 'daily' | 'hourly' | number;
    dateFormat?: string;
    mkdir?: boolean;
    limit?: { count?: number };
  }
  export default function pinoRoll(opcoes: OpcoesPinoRoll): Promise<NodeJS.WritableStream>;
}
