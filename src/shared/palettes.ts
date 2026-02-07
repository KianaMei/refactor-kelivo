/**
 * 主题调色板定义 - 与 kelivo Flutter 版本一致
 */

export interface PaletteColors {
  primary: string
  onPrimary: string
  primaryContainer: string
  surface: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  error: string
}

export interface ThemePaletteDefinition {
  id: string
  zhName: string
  enName: string
  light: PaletteColors
  dark: PaletteColors
}

export const ThemePalettes: Record<string, ThemePaletteDefinition> = {
  default: {
    id: 'default',
    zhName: '默认',
    enName: 'Default',
    light: {
      primary: '#4D5C92',
      onPrimary: '#FFFFFF',
      primaryContainer: '#DCE1FF',
      surface: '#F7F7F7',
      onSurface: '#202020',
      onSurfaceVariant: '#646464',
      outline: '#1A000000',
      error: '#BB0947'
    },
    dark: {
      primary: '#B6C4FF',
      onPrimary: '#1D2D61',
      primaryContainer: '#354479',
      surface: '#121213',
      onSurface: '#F9F9F9',
      onSurfaceVariant: '#CECECE',
      outline: '#1A000000',
      error: '#FCB4BD'
    }
  },
  blue: {
    id: 'blue',
    zhName: '海霄蓝',
    enName: 'Aether Blue',
    light: {
      primary: '#3E5E98',
      onPrimary: '#FFFFFF',
      primaryContainer: '#D6E2FF',
      surface: '#FDFBFF',
      onSurface: '#1B1B1D',
      onSurfaceVariant: '#44464E',
      outline: '#73767E',
      error: '#BB0947'
    },
    dark: {
      primary: '#ACC7FF',
      onPrimary: '#032F67',
      primaryContainer: '#24457F',
      surface: '#1B1B1D',
      onSurface: '#E3E1E6',
      onSurfaceVariant: '#C4C6D0',
      outline: '#8E919A',
      error: '#FCB4BD'
    }
  },
  green: {
    id: 'green',
    zhName: '竹影绿',
    enName: 'Bamboo Green',
    light: {
      primary: '#166C47',
      onPrimary: '#FFFFFF',
      primaryContainer: '#A3F4C5',
      surface: '#FBFDF8',
      onSurface: '#191C1A',
      onSurfaceVariant: '#404942',
      outline: '#707871',
      error: '#A63B00'
    },
    dark: {
      primary: '#87D7AA',
      onPrimary: '#003921',
      primaryContainer: '#005232',
      surface: '#191C1A',
      onSurface: '#E1E3DF',
      onSurfaceVariant: '#C0C9C0',
      outline: '#8A938B',
      error: '#FEB69A'
    }
  },
  purple: {
    id: 'purple',
    zhName: '暮紫韵',
    enName: 'Twilight Purple',
    light: {
      primary: '#5D5698',
      onPrimary: '#FFFFFF',
      primaryContainer: '#E5DEFF',
      surface: '#FFFBFF',
      onSurface: '#1C1B1F',
      onSurfaceVariant: '#47464F',
      outline: '#77757E',
      error: '#BB0947'
    },
    dark: {
      primary: '#C8BFFF',
      onPrimary: '#2E2766',
      primaryContainer: '#453E7F',
      surface: '#1C1B1F',
      onSurface: '#E6E1E6',
      onSurfaceVariant: '#C9C4CF',
      outline: '#928F9A',
      error: '#FCB4BD'
    }
  },
  yellow: {
    id: 'yellow',
    zhName: '琥珀金',
    enName: 'Amber Gold',
    light: {
      primary: '#855304',
      onPrimary: '#FFFFFF',
      primaryContainer: '#FFDDB6',
      surface: '#FFFBF9',
      onSurface: '#1F1B16',
      onSurfaceVariant: '#4F4539',
      outline: '#817467',
      error: '#A63B00'
    },
    dark: {
      primary: '#FDB967',
      onPrimary: '#482A00',
      primaryContainer: '#663D00',
      surface: '#1F1B16',
      onSurface: '#EBE0D9',
      onSurfaceVariant: '#4F4539',
      outline: '#9D8E81',
      error: '#FEB69A'
    }
  },
  pink: {
    id: 'pink',
    zhName: '暮霭玫',
    enName: 'Smoky Rose',
    light: {
      primary: '#824E6C',
      onPrimary: '#FFFFFF',
      primaryContainer: '#FFD8EA',
      surface: '#FFFBFF',
      onSurface: '#201A1D',
      onSurfaceVariant: '#504349',
      outline: '#82737A',
      error: '#BB0947'
    },
    dark: {
      primary: '#F5B3D6',
      onPrimary: '#4E203C',
      primaryContainer: '#673754',
      surface: '#201A1D',
      onSurface: '#ECDFE3',
      onSurfaceVariant: '#D4C2C9',
      outline: '#9D8C93',
      error: '#FCB4BD'
    }
  },
  teal: {
    id: 'teal',
    zhName: '樱桃绿',
    enName: 'Verdant Mint',
    light: {
      primary: '#00B96B',
      onPrimary: '#FFFFFF',
      primaryContainer: '#49E6A233',
      surface: '#F7F7F7',
      onSurface: '#202020',
      onSurfaceVariant: '#646464',
      outline: '#1A000000',
      error: '#FF0000'
    },
    dark: {
      primary: '#00B96B',
      onPrimary: '#FFFFFF',
      primaryContainer: '#00B96B33',
      surface: '#121213',
      onSurface: '#F9F9F9',
      onSurfaceVariant: '#CECECE',
      outline: '#1A000000',
      error: '#FF0000'
    }
  },
  red: {
    id: 'red',
    zhName: '陶砂红',
    enName: 'Terracotta Clay',
    light: {
      primary: '#8B4E3B',
      onPrimary: '#FFFFFF',
      primaryContainer: '#FFDBD0',
      surface: '#FFFBFF',
      onSurface: '#221A18',
      onSurfaceVariant: '#53433E',
      outline: '#86736D',
      error: '#B91F01'
    },
    dark: {
      primary: '#FFB59E',
      onPrimary: '#522211',
      primaryContainer: '#6E3725',
      surface: '#221A18',
      onSurface: '#EFDFDB',
      onSurfaceVariant: '#D9C2BB',
      outline: '#A18C86',
      error: '#FFB5A5'
    }
  },
  orange: {
    id: 'orange',
    zhName: '纸墨灰',
    enName: 'Frost Gray',
    light: {
      primary: '#000000',
      onPrimary: '#FFFFFF',
      primaryContainer: '#EFEFEF',
      surface: '#FFFFFF',
      onSurface: '#000000',
      onSurfaceVariant: '#4D4D4D',
      outline: '#BDBDBD',
      error: '#000000'
    },
    dark: {
      primary: '#FFFFFF',
      onPrimary: '#000000',
      primaryContainer: '#2B2B2B',
      surface: '#000000',
      onSurface: '#FFFFFF',
      onSurfaceVariant: '#BDBDBD',
      outline: '#757575',
      error: '#FFFFFF'
    }
  }
}

// 调色板 ID 列表，用于显示顺序
export const paletteIds = [
  'default',
  'blue',
  'green',
  'purple',
  'yellow',
  'pink',
  'teal',
  'red',
  'orange'
] as const

export type ThemePaletteId = (typeof paletteIds)[number]

export function getPalette(id: string): ThemePaletteDefinition {
  return ThemePalettes[id] || ThemePalettes.default
}
