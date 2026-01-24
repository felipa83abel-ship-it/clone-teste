/**
 * Declaração de tipo genérica para fluent-ffmpeg
 *
 * O módulo fluent-ffmpeg não possui tipagem oficial de TypeScript.
 * Esta declaração permite usar o módulo sem erros de tipo.
 *
 * Todos os valores são tratados como 'any' para evitar verificações de tipo rigorosas.
 */

declare module 'fluent-ffmpeg' {
  const ffmpeg: any;
  export = ffmpeg;
}
