import isString from 'lodash/isString';
import capitalize from 'lodash/capitalize';
import BigNumber from 'bignumber.js';
import { FieldFormat, FieldTrim, FieldType } from '../data-set/enum';
import { getNumberFormatOptions, normalizeLanguage } from '../utils';
import math from '../math';

export interface FormatOptions {
  trim?: FieldTrim;
  format?: FieldFormat | string;
}

export function trimString(value: string, fieldTrim?: FieldTrim): string {
  if (fieldTrim) {
    switch (fieldTrim) {
      case FieldTrim.both:
        return value.trim();
      case FieldTrim.left:
        return value.trimLeft();
      case FieldTrim.right:
        return value.trimRight();
      default:
    }
  }
  return value;
}

export function transformString(value: string, format?: FieldFormat | string): string {
  if (format) {
    switch (format) {
      case FieldFormat.uppercase:
        return value.toUpperCase();
      case FieldFormat.lowercase:
        return value.toLowerCase();
      case FieldFormat.capitalize:
        return capitalize(value);
      default:
    }
  }
  return value;
}

export function formatString(value: any, { trim, format }: FormatOptions) {
  if (isString(value)) {
    return transformString(trimString(value, trim), format);
  }
  return value;
}

function $formatNumber(v: number, lang: string | undefined, options?: Intl.NumberFormatOptions) {
  return v.toLocaleString(normalizeLanguage(lang), options);
}

type BigNumberFormatOptions = {
  decimalSeparator?: string;
  groupSeparator?: string;
  groupSize?: number;
  prefix?: string;
  suffix?: string;
}

const bigNumberGroupMap: Map<string, BigNumberFormatOptions> = new Map();
const bigNumberCurrencyMap: Map<string | undefined, Map<string, BigNumberFormatOptions>> = new Map();
const separatorReg = /\D+/g;

function getCurrencyOptions(lang: string | undefined, options: Intl.NumberFormatOptions): BigNumberFormatOptions | undefined {
  const { style, currency } = options;
  if (style === 'currency' && currency) {
    let currencyMap = bigNumberCurrencyMap.get(lang);
    if (!currencyMap) {
      currencyMap = new Map<string, BigNumberFormatOptions>();
      bigNumberCurrencyMap.set(lang, currencyMap);
    }
    const options = currencyMap.get(currency);
    if (options) {
      return options;
    }
    const formatted = $formatNumber(1, lang, {
      style,
      currency,
    });
    const matches = formatted.match(separatorReg);
    if (matches) {
      const currencyOptions: BigNumberFormatOptions = matches.index === 0 ? {
        prefix: matches[0],
      } : {
        suffix: matches[0],
      };
      currencyMap.set(currency, currencyOptions);
      return currencyOptions;
    }
  }
}

function getBigNumberFormatOptionsByGroupSize(lang: string, groupSize: number): BigNumberFormatOptions | undefined {
  const formatted = $formatNumber(10 ** groupSize + 0.1, lang);
  const matches = formatted.match(separatorReg);
  if (matches && matches.length === 2 && matches.index === 1) {
    const matchedGroup: BigNumberFormatOptions = {
      groupSeparator: matches[0],
      decimalSeparator: matches[1],
      groupSize,
    };
    bigNumberGroupMap.set(lang, matchedGroup);
    return matchedGroup;
  }
}

const defaultBigNumberFormatOptions: BigNumberFormatOptions = {
  groupSeparator: ',',
  decimalSeparator: '.',
  groupSize: 3,
};

function getBigNumberFormatOption(lang: string | undefined): BigNumberFormatOptions {
  if (!lang) {
    return defaultBigNumberFormatOptions;
  }
  const option = bigNumberGroupMap.get(lang);
  if (option) {
    return option;
  }
  for (let groupSize = 3, s = groupSize; s > 0 && groupSize < 6; groupSize += 1) {
    const g = getBigNumberFormatOptionsByGroupSize(lang, groupSize);
    if (g) {
      return g;
    }
    s -= 1;
    const sg = getBigNumberFormatOptionsByGroupSize(lang, s);
    if (sg) {
      return sg;
    }
  }
  bigNumberGroupMap.set(lang, defaultBigNumberFormatOptions);
  return defaultBigNumberFormatOptions;
}

export function formatCurrency(value: BigNumber.Value, lang: string | undefined, options?: Intl.NumberFormatOptions) {
  const bn = new BigNumber(value);
  if (math.isValidBigNumber(bn)) {
    const v = math.fix(bn);
    if (math.isBigNumber(v)) {
      const {
        groupSeparator,
        groupSize,
        decimalSeparator,
      } = getBigNumberFormatOption(lang);
      const { prefix = '', suffix = '' } = options && getCurrencyOptions(lang, options) || {};
      const useGrouping = options ? options.useGrouping : true;
      const fmt: BigNumber.Format = {
        prefix,
        decimalSeparator,
        groupSeparator: useGrouping === false ? '' : groupSeparator,
        groupSize: useGrouping === false ? 0 : groupSize,
        secondaryGroupSize: 0,
        fractionGroupSeparator: ' ',
        fractionGroupSize: 0,
        suffix,
      };
      if (options && options.currency) {
        return v.toFormat(fmt);
      }
      return v.toFormat(2, fmt);
    }
    return $formatNumber(v, lang, {
      ...getNumberFormatOptions(FieldType.currency, options),
      ...options,
    });
  }
  return value;
}

export function formatNumber(value: BigNumber.Value, lang: string | undefined, options?: Intl.NumberFormatOptions) {
  const bn = new BigNumber(value);
  if (math.isValidBigNumber(bn)) {
    const v = math.fix(bn);
    if (math.isBigNumber(v)) {
      const {
        groupSeparator,
        groupSize,
        decimalSeparator,
      } = getBigNumberFormatOption(lang);
      const useGrouping = options ? options.useGrouping : true;
      const fmt: BigNumber.Format = {
        prefix: '',
        decimalSeparator,
        groupSeparator: useGrouping === false ? '' : groupSeparator,
        groupSize: useGrouping === false ? 0 : groupSize,
        secondaryGroupSize: 0,
        fractionGroupSeparator: ' ',
        fractionGroupSize: 0,
        suffix: '',
      };
      return v.toFormat(fmt);
    }
    return $formatNumber(v, lang, {
      ...getNumberFormatOptions(FieldType.number, options),
      ...options,
    });
  }
  return value;
}

const nargs = /\{([0-9a-zA-Z_]+)\}/g;

export function formatTemplate(string: string, args: object | any[], lazy?: boolean) {
  return string.replace(nargs, (match, i, index) => {
    if (string[index - 1] === '{' &&
      string[index + match.length] === '}') {
      return i;
    }
    const has = Object.hasOwnProperty.call(args, i);
    if (has) {
      const result = has ? args[i] : null;
      if (result === null || result === undefined) {
        return '';
      }

      return result;
    }
    return lazy ? `{${i}}` : '';
  });
}

const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatFileSize(size: number, unitIndex = 0) {
  if (size < 1024) {
    return `${size}${units[unitIndex]}`;
  }
  return formatFileSize(Math.round(size / 1024), unitIndex + 1);
}
