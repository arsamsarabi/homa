import {
  type CSSVariablesResolver,
  createTheme,
  type MantineColorsTuple,
  type MantineThemeOverride,
  virtualColor,
} from '@mantine/core';

// Brand palette: space indigo #22223b, dusty grape #4a4e69, lilac ash #9a8c98,
// almond silk #c9ada7, parchment #f2e9e4. Index 6 of `grape` and 4 of `almond` are the brand values.
const grape: MantineColorsTuple = [
  '#f4f3f7',
  '#e6e5ee',
  '#cac9d9',
  '#acabc3',
  '#9392b0',
  '#7d7ea0',
  '#4a4e69',
  '#3f4259',
  '#34374a',
  '#292b3b',
];
const almond: MantineColorsTuple = [
  '#fbf7f6',
  '#f4ebe8',
  '#e8d8d3',
  '#dbc4be',
  '#c9ada7',
  '#b8968f',
  '#a37f78',
  '#866660',
  '#6a4f4a',
  '#4f3a36',
];
// Mantine's dark scale: 0 is text, 6 the surface, 7 the page background.
const dark: MantineColorsTuple = [
  '#f2e9e4',
  '#ddd2ce',
  '#a99ca7',
  '#8a7f8c',
  '#4a4e69',
  '#3a3b58',
  '#2c2c48',
  '#22223b',
  '#1c1c31',
  '#151526',
];

export const theme: MantineThemeOverride = createTheme({
  colors: { grape, almond, dark, primary: virtualColor({ name: 'primary', light: 'grape', dark: 'almond' }) },
  primaryColor: 'primary',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  white: '#faf6f3',
  black: '#22223b',
  fontFamily: 'Satoshi, system-ui, sans-serif',
  headings: { fontFamily: 'Rajdhani, system-ui, sans-serif', fontWeight: '700' },
  defaultRadius: 'md',
});

// Page background: parchment in light (cards stay on the lighter `white`), space indigo in dark.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-body': '#f2e9e4' },
  dark: {},
});
