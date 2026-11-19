import {
  type CSSVariablesResolver,
  createTheme,
  type MantineColorsTuple,
  type MantineThemeOverride,
  virtualColor,
} from '@mantine/core';

// Brand palette: space indigo #22223b, dusty grape #4a4e69, lilac ash #9a8c98,
// almond silk #c9ada7, parchment #f2e9e4. Index 6 of `grape` and 4 of `almond` are the brand values.
// Backgrounds and surfaces follow brand/tokens.css (guidelines v4).
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
// Mantine's dark scale: 0 is text, 6 the surface (space indigo), 7 the page background.
const dark: MantineColorsTuple = [
  '#f2e9e4',
  '#ddd2ce',
  '#a99ca7',
  '#8a7f8c',
  '#4a4e69',
  '#2c2c48',
  '#22223b',
  '#16162a',
  '#111122',
  '#0b0b18',
];

export const theme: MantineThemeOverride = createTheme({
  colors: { grape, almond, dark, primary: virtualColor({ name: 'primary', light: 'grape', dark: 'almond' }) },
  primaryColor: 'primary',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  white: '#fefcfb',
  black: '#22223b',
  fontFamily: 'Satoshi, system-ui, sans-serif',
  headings: { fontFamily: 'Rajdhani, system-ui, sans-serif', fontWeight: '700' },
  defaultRadius: 'md',
});

// Page background in light (cards stay on the lighter `white`); dark uses the dark scale's 7.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-body': '#f9f5f2' },
  dark: {},
});
