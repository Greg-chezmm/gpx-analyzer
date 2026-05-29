import { useState } from "react";

function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useUserSettings() {
  const [fcMax,   setFcMaxRaw]   = useState(() => load("gpx_fcMax",   195));
  const [fcRest,  setFcRestRaw]  = useState(() => load("gpx_fcRest",   52));
  const [vma,     setVmaRaw]     = useState(() => load("gpx_vma",      18));
  const [ftp,     setFtpRaw]     = useState(() => load("gpx_ftp",     200));
  const [weight,    setWeightRaw]    = useState(() => load("gpx_weight",    70));
  const [birthYear, setBirthYearRaw] = useState(() => load("gpx_birthYear", 1982));

  const setFcMax    = (v: number) => { localStorage.setItem("gpx_fcMax",     String(v)); setFcMaxRaw(v);    };
  const setFcRest   = (v: number) => { localStorage.setItem("gpx_fcRest",    String(v)); setFcRestRaw(v);   };
  const setVma      = (v: number) => { localStorage.setItem("gpx_vma",       String(v)); setVmaRaw(v);      };
  const setFtp      = (v: number) => { localStorage.setItem("gpx_ftp",       String(v)); setFtpRaw(v);      };
  const setWeight   = (v: number) => { localStorage.setItem("gpx_weight",    String(v)); setWeightRaw(v);   };
  const setBirthYear = (v: number) => { localStorage.setItem("gpx_birthYear", String(v)); setBirthYearRaw(v); };

  return { fcMax, setFcMax, fcRest, setFcRest, vma, setVma, ftp, setFtp, weight, setWeight, birthYear, setBirthYear };
}
