import * as FileSystem from "expo-file-system";
import { toByteArray } from "base64-js";
import { sha256 } from "js-sha256";

export async function hashFileSha256(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const bytes = toByteArray(base64);
  return sha256(bytes);
}
