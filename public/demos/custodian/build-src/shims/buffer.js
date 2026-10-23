// Injected as the global Buffer. packages/server/src/mcp/icons.ts builds its data: URIs with
// Buffer.from(svg).toString('base64'); that is the only call this needs to cover.
export const Buffer = {
  from(text) {
    return {
      toString(encoding) {
        if (encoding !== 'base64') throw new Error(`Buffer shim: unsupported encoding ${encoding}`);
        let bin = '';
        for (const b of new TextEncoder().encode(String(text))) bin += String.fromCharCode(b);
        return btoa(bin);
      },
    };
  },
};
