/** LogiSlot marka bileşenleri — temaya göre doğru light/dark asset seçilir. */

import { Image } from "react-native";
import { useTheme } from "@/theme/theme";

const LOGO_LIGHT = require("../../assets/brand/logislot-logo-light.png");
const LOGO_DARK = require("../../assets/brand/logislot-logo-dark.png");
const ICON_LIGHT = require("../../assets/brand/logislot-icon-light.png");
const ICON_DARK = require("../../assets/brand/logislot-icon-dark.png");

export function LogiSlotLogo({ height = 40 }: { height?: number }) {
  const { resolved } = useTheme();
  // Master: 713x220 → oran ~3.24
  return (
    <Image
      source={resolved === "dark" ? LOGO_DARK : LOGO_LIGHT}
      style={{ height, width: height * 3.24, resizeMode: "contain" }}
      accessibilityLabel="LogiSlot"
    />
  );
}

export function LogiSlotIcon({ size = 64 }: { size?: number }) {
  const { resolved } = useTheme();
  return (
    <Image
      source={resolved === "dark" ? ICON_DARK : ICON_LIGHT}
      style={{ width: size, height: size, resizeMode: "contain" }}
      accessibilityLabel="LogiSlot"
    />
  );
}
