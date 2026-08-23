export const ALERT_META = {
  "FALL DETECTED": {
    module: "Fall",
    label: "Fall Detected",
    bg: "bg-[#ef4444]",
    border: "border-l-[#ef4444]",
    text: "text-[#ef4444]",
    badge: "bg-[#ef4444]",
    icon: "🚨",
    severity: "High",
  },
  "PROLONGED FALL": {
    module: "Fall",
    label: "Prolonged Fall",
    bg: "bg-[#dc2626]",
    border: "border-l-[#dc2626]",
    text: "text-[#dc2626]",
    badge: "bg-[#dc2626]",
    icon: "🚨",
    severity: "High",
  },
  AGITATION_RISK: {
    module: "Agitation",
    label: "Agitation Risk",
    bg: "bg-[#a855f7]",
    border: "border-l-[#a855f7]",
    text: "text-[#a855f7]",
    badge: "bg-[#a855f7]",
    icon: "😤",
    severity: "Medium",
  },
  INACTIVE: {
    module: "Inactivity",
    label: "Inactivity",
    bg: "bg-[#eab308]",
    border: "border-l-[#eab308]",
    text: "text-[#eab308]",
    badge: "bg-[#eab308]",
    icon: "💤",
    severity: "Medium",
  },
  "LYING DOWN": {
    module: "Lying Down",
    label: "Lying Down",
    bg: "bg-[#64748b]",
    border: "border-l-[#64748b]",
    text: "text-[#64748b]",
    badge: "bg-[#64748b]",
    icon: "🛏️",
    severity: "Low",
  },
  STUMBLE: {
    module: "Fall",
    label: "Stumble Detected",
    bg: "bg-[#fb923c]",
    border: "border-l-[#fb923c]",
    text: "text-[#fb923c]",
    badge: "bg-[#fb923c]",
    icon: "⚠️",
    severity: "Low",
  },
};

export const MODULE_LABELS = {
  Fall: "Fall",
  Agitation: "Agitation",
  Inactivity: "Inactivity",
  "Lying Down": "Lying Down",
};

export const FALLBACK_META = {
  module: "?",
  label: "Alert",
  bg: "bg-[#636e72]",
  border: "border-l-[#636e72]",
  text: "text-[#636e72]",
  badge: "bg-[#636e72]",
  icon: "🔔",
  severity: "Low",
};

export const resolveAlertMeta = (message = "", alertType = "") => {
  const combined = `${message || ""} ${alertType || ""}`.toUpperCase();

  // Normalize helper: uppercase and remove non-alphanumerics for robust matching
  const normalize = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
  const normCombined = normalize(combined);

  for (const [key, meta] of Object.entries(ALERT_META)) {
    const k = String(key).toUpperCase();
    const variants = new Set([k, k.replace(/_/g, " "), k.replace(/[_\s]/g, "")]);

    // handle common suffix variants (INACTIVE <-> INACTIVITY)
    if (/IVE$/.test(k)) variants.add(k.replace(/IVE$/, "ITY"));
    if (/ITY$/.test(k)) variants.add(k.replace(/ITY$/, "IVE"));

    for (const variant of variants) {
      const vNorm = normalize(variant);
      if (!vNorm) continue;
      if (normCombined.includes(vNorm)) return meta;
    }
  }

  return FALLBACK_META;
};
