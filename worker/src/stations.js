// Destination candidates: major German stations.
// Format: [EVA number, name, lat, lon] — IDs verified against bahn.de station search (Nov 2026).
export const STATIONS = [
  ['8000261', 'München Hbf', 48.1404, 11.5587],
  ['8000284', 'Nürnberg Hbf', 49.4454, 11.0823],
  ['8000013', 'Augsburg Hbf', 48.3652, 10.8856],
  ['8000309', 'Regensburg Hbf', 49.0117, 12.0997],
  ['8000183', 'Ingolstadt Hbf', 48.7445, 11.4373],
  ['8000260', 'Würzburg Hbf', 49.8022, 9.9359],
  ['8000025', 'Bamberg', 49.9008, 10.8995],
  ['8001844', 'Erlangen', 49.5960, 11.0017],
  ['8000298', 'Passau Hbf', 48.5738, 13.4508],
  ['8000320', 'Rosenheim', 47.8500, 12.1193],
  ['8000217', 'Landshut(Bay)Hbf', 48.5475, 12.1359],
  ['8002187', 'Garmisch-Partenkirchen', 47.4912, 11.0970],
  ['8003693', 'Lindau-Reutin', 47.5524, 9.7028],
  ['8000197', 'Kempten(Allgäu)Hbf', 47.7118, 10.3177],
  ['8000096', 'Stuttgart Hbf', 48.7848, 9.1828],
  ['8000170', 'Ulm Hbf', 48.3996, 9.9824],
  ['8000191', 'Karlsruhe Hbf', 48.9935, 8.4019],
  ['8000244', 'Mannheim Hbf', 49.4792, 8.4693],
  ['8000156', 'Heidelberg Hbf', 49.4036, 8.6755],
  ['8000107', 'Freiburg(Breisgau) Hbf', 47.9980, 7.8413],
  ['8000105', 'Frankfurt(Main)Hbf', 50.1068, 8.6630],
  ['8000240', 'Mainz Hbf', 50.0012, 8.2585],
  ['8000250', 'Wiesbaden Hbf', 50.0706, 8.2436],
  ['8000068', 'Darmstadt Hbf', 49.8725, 8.6297],
  ['8000115', 'Fulda', 50.5548, 9.6842],
  ['8003200', 'Kassel-Wilhelmshöhe', 51.3130, 9.4468],
  ['8000128', 'Göttingen', 51.5368, 9.9263],
  ['8010101', 'Erfurt Hbf', 50.9725, 11.0385],
  ['8011956', 'Jena Paradies', 50.9249, 11.5876],
  ['8010366', 'Weimar', 50.9917, 11.3265],
  ['8010205', 'Leipzig Hbf', 51.3451, 12.3812],
  ['8010085', 'Dresden Hbf', 51.0402, 13.7314],
  ['8010159', 'Halle(Saale)Hbf', 51.4771, 11.9870],
  ['8010224', 'Magdeburg Hbf', 52.1305, 11.6269],
  ['8011160', 'Berlin Hbf', 52.5249, 13.3696],
  ['8012666', 'Potsdam Hbf', 52.3916, 13.0667],
  ['8000152', 'Hannover Hbf', 52.3771, 9.7418],
  ['8000049', 'Braunschweig Hbf', 52.2521, 10.5404],
  ['8006552', 'Wolfsburg Hbf', 52.4295, 10.7878],
  ['8002549', 'Hamburg Hbf', 53.5535, 10.0064],
  ['8000050', 'Bremen Hbf', 53.0833, 8.8137],
  ['8000199', 'Kiel Hbf', 54.3149, 10.1318],
  ['8000237', 'Lübeck Hbf', 53.8677, 10.6697],
  ['8010304', 'Rostock Hbf', 54.0782, 12.1313],
  ['8000207', 'Köln Hbf', 50.9428, 6.9592],
  ['8000044', 'Bonn Hbf', 50.7320, 7.0967],
  ['8000085', 'Düsseldorf Hbf', 51.2197, 6.7940],
  ['8000080', 'Dortmund Hbf', 51.5179, 7.4593],
  ['8000098', 'Essen Hbf', 51.4514, 7.0139],
  ['8000086', 'Duisburg Hbf', 51.4296, 6.7761],
  ['8000263', 'Münster(Westf)Hbf', 51.9565, 7.6359],
  ['8000036', 'Bielefeld Hbf', 52.0294, 8.5328],
  ['8000294', 'Osnabrück Hbf', 52.2725, 8.0613],
  ['8000001', 'Aachen Hbf', 50.7676, 6.0912],
  ['8000206', 'Koblenz Hbf', 50.3508, 7.5883],
  ['8000134', 'Trier Hbf', 49.7568, 6.6524],
  ['8000323', 'Saarbrücken Hbf', 49.2414, 6.9911],
  ['8003400', 'Konstanz', 47.6588, 9.1774],
  ['8000157', 'Heilbronn Hbf', 49.1432, 9.2076],
  ['8000028', 'Bayreuth Hbf', 49.9496, 11.5800],
  ['8002924', 'Hof Hbf', 50.3078, 11.9228],
  ['8001338', 'Coburg', 50.2628, 10.9574],
  ['8000046', 'Siegen Hbf', 50.8756, 8.0159],
  ['8000291', 'Oldenburg(Oldb)Hbf', 53.1441, 8.2227],
  ['8010324', 'Schwerin Hbf', 53.6347, 11.4075],
  ['8010073', 'Cottbus Hbf', 51.7511, 14.3237],
  ['8010184', 'Chemnitz Hbf', 50.8383, 12.9307],
  ['8010397', 'Zwickau(Sachs)Hbf', 50.7156, 12.4755],
  ['8000290', 'Offenburg', 48.4765, 7.9468],
  ['8000774', 'Baden-Baden', 48.7904, 8.1908],
];

export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Destinations ordered by distance from the origin, skipping the origin itself and anything closer than minKm.
export function destinationsFor(originId, lat, lon, minKm = 25) {
  return STATIONS
    .filter(([id]) => id !== originId)
    .map(([id, name, la, lo]) => ({ id, name, km: Math.round(distanceKm(lat, lon, la, lo)) }))
    .filter(d => d.km >= minKm)
    .sort((a, b) => a.km - b.km);
}
