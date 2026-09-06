export const readSaved = async () => localStorage.getItem('pocket-trainer:v1');
export const writeSaved = async (value: string) => { localStorage.setItem('pocket-trainer:v1', value); };
export const readPrices = async () => localStorage.getItem('pocket-trainer:prices:v1');
export const writePrices = async (value: string) => { localStorage.setItem('pocket-trainer:prices:v1', value); };
