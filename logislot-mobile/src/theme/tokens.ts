/**
 * LogiSlot mobil tema tokenları — web'deki HSL tokenlarının (globals.css)
 * hex karşılıkları. Marka: derin navy (#00183C logosundan) + logistics mavi.
 */

export interface ThemeColors {
  background: string;
  card: string;
  cardElevated: string;
  text: string;
  mutedText: string;
  faintText: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  destructive: string;
  brandNavy: string;
  status: {
    pending: string;
    approved: string;
    revision: string;
    rejected: string;
    completed: string;
    cancelled: string;
  };
  cargo: string;
}

export const lightColors: ThemeColors = {
  background: "#F2F6FA",
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  text: "#131C2B",
  mutedText: "#5E6B80",
  faintText: "#8B97A8",
  border: "#DDE5EE",
  primary: "#0B2C56",
  primaryText: "#FFFFFF",
  accent: "#2178DE",
  destructive: "#DA2E2E",
  brandNavy: "#0A1B33",
  status: {
    pending: "#DE930A",
    approved: "#1F9668",
    revision: "#7C4FD6",
    rejected: "#DA2E2E",
    completed: "#1571CC",
    cancelled: "#707C8E",
  },
  cargo: "#F26E0D",
};

export const darkColors: ThemeColors = {
  background: "#090E16",
  card: "#0E1622",
  cardElevated: "#131D2C",
  text: "#F0F4F9",
  mutedText: "#93A2B8",
  faintText: "#64748B",
  border: "#1D2839",
  primary: "#2E86F0",
  primaryText: "#0A1424",
  accent: "#3E92F5",
  destructive: "#EF5350",
  brandNavy: "#0A1B33",
  status: {
    pending: "#F2AE2A",
    approved: "#31BE8B",
    revision: "#A98BF0",
    rejected: "#F16A6A",
    completed: "#3CA5F5",
    cancelled: "#8A97A9",
  },
  cargo: "#F58A3D",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
