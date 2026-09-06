import Storage from 'expo-sqlite/kv-store';
export const readSaved = () => Storage.getItem('pocket-trainer:v1');
export const writeSaved = (value: string) => Storage.setItem('pocket-trainer:v1', value);
export const readPrices = () => Storage.getItem('pocket-trainer:prices:v1');
export const writePrices = (value: string) => Storage.setItem('pocket-trainer:prices:v1', value);
