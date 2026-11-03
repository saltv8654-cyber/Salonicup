import data from "@/data/tariffs.json";
import type { TariffFile } from "./types";

export function loadTariffs(): TariffFile {
  return data as TariffFile;
}
