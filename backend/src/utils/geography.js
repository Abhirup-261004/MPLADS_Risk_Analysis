const stateCenters = {
  'andhra pradesh': [15.9, 79.7], 'arunachal pradesh': [28.2, 94.7], assam: [26.2, 92.9], bihar: [25.8, 85.1], chhattisgarh: [21.3, 82.0], goa: [15.3, 74.1], gujarat: [22.3, 71.2], haryana: [29.1, 76.1], 'himachal pradesh': [31.1, 77.2], jharkhand: [23.6, 85.3], karnataka: [15.3, 75.7], kerala: [10.4, 76.4], madhya: [23.5, 78.7], maharashtra: [19.7, 75.7], manipur: [24.7, 93.9], meghalaya: [25.5, 91.3], mizoram: [23.2, 92.9], nagaland: [26.1, 94.6], odisha: [20.9, 85.1], punjab: [31.0, 75.3], rajasthan: [26.9, 73.8], sikkim: [27.5, 88.5], tamil: [11.1, 78.6], telangana: [17.9, 79.2], tripura: [23.8, 91.3], 'uttar pradesh': [26.9, 80.9], uttarakhand: [30.1, 79.2], 'west bengal': [23.0, 87.9], delhi: [28.6, 77.2], 'jammu and kashmir': [33.5, 75.2], ladakh: [34.2, 77.6], puducherry: [11.9, 79.8], chandigarh: [30.7, 76.8], 'andaman and nicobar islands': [11.7, 92.7], lakshadweep: [10.6, 72.6], 'dadra and nagar haveli and daman and diu': [20.3, 73.0],
};

function hash(value) { return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7); }

export function zoneCoordinates(state, district) {
  const normalized = String(state || '').toLowerCase();
  const center = Object.entries(stateCenters).find(([name]) => normalized.includes(name) || name.includes(normalized))?.[1] || [22.5, 79];
  const value = hash(`${state}-${district}`);
  return { latitude: Number((center[0] + (((value % 1000) / 1000) - .5) * 3.2).toFixed(4)), longitude: Number((center[1] + ((((value / 1000) % 1000) / 1000) - .5) * 3.8).toFixed(4)) };
}
