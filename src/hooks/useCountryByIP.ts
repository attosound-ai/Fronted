import { useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { getCountryByISO } from '@/utils/countryCodes';

interface CountryResult {
  dial: string;
  flag: string;
  isLoading: boolean;
}

const DEFAULT_DIAL = '+1';
const DEFAULT_FLAG = '🇺🇸';
const IP_API_TIMEOUT = 3000;

let cachedDial: string | null = null;
let cachedFlag: string | null = null;

function getLocaleCountry(): { dial: string; flag: string } | null {
  const regionCode = getLocales()[0]?.regionCode;
  if (!regionCode) return null;
  const country = getCountryByISO(regionCode);
  if (!country) return null;
  return { dial: country.dial, flag: country.flag };
}

export function useCountryByIP(): CountryResult {
  const [dial, setDial] = useState(cachedDial ?? DEFAULT_DIAL);
  const [flag, setFlag] = useState(cachedFlag ?? DEFAULT_FLAG);
  const [isLoading, setIsLoading] = useState(!cachedDial);

  useEffect(() => {
    if (cachedDial) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IP_API_TIMEOUT);

    fetch('http://ip-api.com/json/?fields=countryCode', {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { countryCode?: string }) => {
        if (data.countryCode) {
          const country = getCountryByISO(data.countryCode);
          if (country) {
            cachedDial = country.dial;
            cachedFlag = country.flag;
            setDial(country.dial);
            setFlag(country.flag);
            return;
          }
        }
        applyFallback();
      })
      .catch(() => {
        applyFallback();
      })
      .finally(() => {
        clearTimeout(timeout);
        setIsLoading(false);
      });

    function applyFallback() {
      const locale = getLocaleCountry();
      if (locale) {
        cachedDial = locale.dial;
        cachedFlag = locale.flag;
        setDial(locale.dial);
        setFlag(locale.flag);
      } else {
        cachedDial = DEFAULT_DIAL;
        cachedFlag = DEFAULT_FLAG;
      }
    }

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return { dial, flag, isLoading };
}
