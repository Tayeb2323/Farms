// Données globales
let geoJsonData = [];
let globalOverlays = {};

// Variables pour le côté gauche
let leftPivotID = null;
let leftPolygons = [];
let leftOverlay = null;
let leftIndexName = "NDVI";
let leftNdviIndex = 0;
let flatpickrLeft = null;
let leftMap;

// Variables pour le côté droit (comparaison)
let rightPivotID = null;
let rightPolygons = [];
let rightOverlay = null;
let rightIndexName = "NDVI";
let rightNdviIndex = 0;
let flatpickrRight = null;
let rightMap;

// Variables pour le marqueur d’observation
let observationMarker = null;
let isObservationMode = false;
let coordinatesDisplayTimeout = null;

// Mode comparaison flag
let isComparisonMode = false;

const allIndices = ["NDVI", "NDRE", "NDWI", "NDMI", "LAI", "SALINITY"];
const geoJsonUrl = "https://raw.githubusercontent.com/Tayeb2323/Farms/main/Benahmouda_pivot.geojson";
const metadataUrl = "https://raw.githubusercontent.com/Tayeb2323/Farms/main/overlays_metadata.json";

// Chargement des données
Promise.all([
  fetch(geoJsonUrl).then(r => r.json()).then(json => geoJsonData = json.features),
  fetch(metadataUrl).then(r => r.json()).then(json => globalOverlays = json)
])
.then(initMap)
.catch(err => console.error("Erreur:", err));

function initMap() {
  // Initialiser la carte de gauche
  leftMap = new google.maps.Map(document.getElementById("leftMap"), {
    zoom: 12,
    center: {lat: 35, lng: 0},
    mapTypeId: google.maps.MapTypeId.SATELLITE,
    fullscreenControl: true
  });
  // Remplir les dropdowns pour les deux côtés
  populateFarmDropdown("fermeSelectLeft");
  populateFarmDropdown("fermeSelectRight");
  populateIndexDropdown("indexSelectLeft");
  populateIndexDropdown("indexSelectRight");
  
  // Initialiser Flatpickr côté gauche
  setupDatePicker("datePickerLeft", "left");
  
  // Événement sur le dropdown de la ferme côté gauche
  document.getElementById("fermeSelectLeft").addEventListener("change", () => {
    afficherPolygoneLeft(document.getElementById("fermeSelectLeft").value);
  });
  // Événement sur le dropdown d'indice côté gauche
  document.getElementById("indexSelectLeft").addEventListener("change", () => {
    leftIndexName = document.getElementById("indexSelectLeft").value;
    let oldDate = getCurrentSelectedDate("left");
    if (globalOverlays[leftPivotID] && globalOverlays[leftPivotID][leftIndexName]) {
      let newArr = globalOverlays[leftPivotID][leftIndexName].slice();
      newArr.sort((a, b) => b.date.localeCompare(a.date));
      const foundIndex = newArr.findIndex(item => item.date === oldDate);
      if (foundIndex !== -1) {
        leftNdviIndex = foundIndex;
      } else if (leftNdviIndex >= newArr.length) {
        leftNdviIndex = newArr.length - 1;
      }
    }
    afficherNDVI("left");
  });
  
  // Événement sur le dropdown côté droit
  document.getElementById("fermeSelectRight").addEventListener("change", () => {
    afficherPolygoneRight(document.getElementById("fermeSelectRight").value);
  });
  document.getElementById("indexSelectRight").addEventListener("change", () => {
    rightIndexName = document.getElementById("indexSelectRight").value;
    let oldDate = getCurrentSelectedDate("right");
    if (globalOverlays[rightPivotID] && globalOverlays[rightPivotID][rightIndexName]) {
      let newArr = globalOverlays[rightPivotID][rightIndexName].slice();
      newArr.sort((a, b) => b.date.localeCompare(a.date));
      const foundIndex = newArr.findIndex(item => item.date === oldDate);
      if (foundIndex !== -1) {
        rightNdviIndex = foundIndex;
      } else if (rightNdviIndex >= newArr.length) {
        rightNdviIndex = newArr.length - 1;
      }
    }
    afficherNDVI("right");
  });
  
  // Événement sur la case comparaison
  document.getElementById("comparisonCheckbox").addEventListener("change", toggleComparisonMode);
  
  // Afficher d'emblée la première ferme et indice côté gauche
  document.getElementById("fermeSelectLeft").selectedIndex = 0;
  document.getElementById("indexSelectLeft").selectedIndex = 0;
  afficherPolygoneLeft(0);
  
  updateFlatpickr("left");
  
  // Pour garantir que le calendrier s'ouvre au clic
  document.getElementById("datePickerLeft").addEventListener("click", () => {
    flatpickrLeft.open();
  });
  
  // Événement sur le bouton d'observation
  document.getElementById('toggleObservationBtn').addEventListener('click', toggleObservationMode);
}

function populateFarmDropdown(selectId) {
  const farmSelect = document.getElementById(selectId);
  farmSelect.innerHTML = "";
  geoJsonData.forEach((feature, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = feature.properties.nom || ("Ferme " + feature.properties.id);
    farmSelect.appendChild(opt);
  });
}

function populateIndexDropdown(selectId) {
  const indexSelect = document.getElementById(selectId);
  indexSelect.innerHTML = "";
  allIndices.forEach(indexName => {
    const opt = document.createElement("option");
    opt.value = indexName;
    opt.textContent = indexName;
    indexSelect.appendChild(opt);
  });
}

function setupDatePicker(inputId, side) {
  const datePicker = document.getElementById(inputId);
  let instance = flatpickr(datePicker, {
    dateFormat: "Y-m-d",
    onChange: function(selectedDates, dateStr) {
      const pivotID = (side === "left") ? leftPivotID : rightPivotID;
      if (!pivotID) return;
      const pivotObj = globalOverlays[pivotID];
      if (!pivotObj) return;
      const arr = pivotObj[(side === "left") ? leftIndexName : rightIndexName];
      if (!arr) return;
      const idx = arr.findIndex(item => item.date === dateStr);
      if (idx !== -1) {
        if (side === "left") { leftNdviIndex = idx; }
        else { rightNdviIndex = idx; }
        afficherNDVI(side);
      }
    },
    onDayCreate: function(dObj, dStr, fp, dayElem) {
      const availableDates = fp.config.enable || [];
      const dayDate = dayElem.dateObj.toISOString().slice(0, 10);
      if (availableDates.includes(dayDate)) {
        dayElem.classList.add("enabled-date");
      }
    }
  });
  if (side === "left") { flatpickrLeft = instance; }
  else { flatpickrRight = instance; }
}

// Affiche le polygone sur la carte de gauche
function afficherPolygoneLeft(i) {
  const feature = geoJsonData[i];
  if (!feature) return;
  leftPolygons.forEach(p => p.setMap(null));
  leftPolygons = [];
  if (leftOverlay) leftOverlay.setMap(null);
  leftPivotID = feature.properties.id;
  let bounds = new google.maps.LatLngBounds();
  feature.geometry.coordinates.forEach(polyCoords => {
    const path = polyCoords[0].map(([lng, lat]) => ({lat, lng}));
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#DEB887",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#F5DEB3",
      fillOpacity: 0.35
    });
    polygon.setMap(leftMap);
    leftPolygons.push(polygon);
    path.forEach(pt => bounds.extend(pt));
  });
  leftMap.fitBounds(bounds);
  afficherNDVI("left");
}

// Affiche le polygone sur la carte de droite
function afficherPolygoneRight(i) {
  const feature = geoJsonData[i];
  if (!feature) return;
  rightPolygons.forEach(p => p.setMap(null));
  rightPolygons = [];
  if (rightOverlay) rightOverlay.setMap(null);
  rightPivotID = feature.properties.id;
  let bounds = new google.maps.LatLngBounds();
  feature.geometry.coordinates.forEach(polyCoords => {
    const path = polyCoords[0].map(([lng, lat]) => ({lat, lng}));
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#DEB887",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#F5DEB3",
      fillOpacity: 0.35
    });
    polygon.setMap(rightMap);
    rightPolygons.push(polygon);
    path.forEach(pt => bounds.extend(pt));
  });
  rightMap.fitBounds(bounds);
  afficherNDVI("right");
}

// Affiche l'overlay sur un côté ("left" ou "right")
function afficherNDVI(side) {
  let pivotID = (side === "left") ? leftPivotID : rightPivotID;
  if (!pivotID) return;
  const pivotObj = globalOverlays[pivotID];
  const datePickerId = (side === "left") ? "datePickerLeft" : "datePickerRight";
  const datePicker = document.getElementById(datePickerId);
  if (!pivotObj) {
    datePicker.style.display = "none";
    return;
  }
  const arr = pivotObj[(side === "left") ? leftIndexName : rightIndexName];
  if (!arr || arr.length === 0) {
    datePicker.style.display = "none";
    return;
  }
  arr.sort((a, b) => b.date.localeCompare(a.date));
  if (side === "left") {
    if (leftNdviIndex < 0) leftNdviIndex = 0;
    if (leftNdviIndex >= arr.length) leftNdviIndex = arr.length - 1;
  } else {
    if (rightNdviIndex < 0) rightNdviIndex = 0;
    if (rightNdviIndex >= arr.length) rightNdviIndex = arr.length - 1;
  }
  const item = arr[(side === "left") ? leftNdviIndex : rightNdviIndex];
  const bounds = getBoundsForPivot(pivotID);
  if (!bounds) return;
  if (side === "left" && leftOverlay) leftOverlay.setMap(null);
  if (side === "right" && rightOverlay) rightOverlay.setMap(null);
  const overlay = new google.maps.GroundOverlay(item.png_path, bounds);
  overlay.setMap((side === "left") ? leftMap : rightMap);
  if (side === "left") leftOverlay = overlay;
  else rightOverlay = overlay;
  datePicker.style.display = "inline-block";
}

function getBoundsForPivot(pivotID) {
  const f = geoJsonData.find(fe => fe.properties.id === pivotID);
  if (!f) return null;
  const coords = f.geometry.coordinates[0][0];
  const bounds = new google.maps.LatLngBounds();
  coords.forEach(([lng, lat]) => bounds.extend({lat, lng}));
  return bounds;
}

// Récupère la date actuellement sélectionnée pour un côté
function getCurrentSelectedDate(side) {
  let pivotID = (side === "left") ? leftPivotID : rightPivotID;
  const pivotObj = globalOverlays[pivotID];
  if (!pivotObj) return null;
  const arr = pivotObj[(side === "left") ? leftIndexName : rightIndexName];
  if (!arr || arr.length === 0) return null;
  arr.sort((a, b) => b.date.localeCompare(a.date));
  if (side === "left") {
    if (leftNdviIndex < 0) leftNdviIndex = 0;
    if (leftNdviIndex >= arr.length) leftNdviIndex = arr.length - 1;
    return arr[leftNdviIndex].date;
  } else {
    if (rightNdviIndex < 0) rightNdviIndex = 0;
    if (rightNdviIndex >= arr.length) rightNdviIndex = arr.length - 1;
    return arr[rightNdviIndex].date;
  }
}

// Met à jour Flatpickr pour un côté
function updateFlatpickr(side) {
  let pivotID = (side === "left") ? leftPivotID : rightPivotID;
  const pivotObj = globalOverlays[pivotID];
  if (!pivotObj) return;
  const arr = pivotObj[(side === "left") ? leftIndexName : rightIndexName];
  if (!arr || arr.length === 0) return;
  arr.sort((a, b) => b.date.localeCompare(a.date));
  if (side === "left") {
    flatpickrLeft.set("minDate", arr[arr.length - 1].date);
    flatpickrLeft.set("maxDate", arr[0].date);
    flatpickrLeft.setDate(arr[leftNdviIndex].date, false);
    const availableDates = arr.map(x => x.date);
    flatpickrLeft.set("enable", availableDates);
    flatpickrLeft.redraw();
  } else {
    flatpickrRight.set("minDate", arr[arr.length - 1].date);
    flatpickrRight.set("maxDate", arr[0].date);
    flatpickrRight.setDate(arr[rightNdviIndex].date, false);
    const availableDates = arr.map(x => x.date);
    flatpickrRight.set("enable", availableDates);
    flatpickrRight.redraw();
  }
}

// Met à jour Flatpickr pour les deux côtés
function updateFlatpickrBoth() {
  updateFlatpickr("left");
  if (isComparisonMode) updateFlatpickr("right");
}

// Met à jour les overlays sur les deux côtés
function afficherNDVICommun() {
  afficherNDVI("left");
  if (isComparisonMode && rightMap) {
    afficherNDVI("right");
  }
  updateFlatpickrBoth();
}

// Active ou désactive le mode comparaison
function toggleComparisonMode() {
  const compCheckbox = document.getElementById("comparisonCheckbox");
  isComparisonMode = compCheckbox.checked;
  const farmSelectRight = document.getElementById("fermeSelectRight");
  const indexSelectRight = document.getElementById("indexSelectRight");
  const datePickerRight = document.getElementById("datePickerRight");
  const mapContainer = document.getElementById("mapContainer");
  if (isComparisonMode) {
    farmSelectRight.style.display = "inline-block";
    indexSelectRight.style.display = "inline-block";
    datePickerRight.style.display = "inline-block";
    if (!rightMap) {
      rightMap = new google.maps.Map(document.getElementById("rightMap"), {
        zoom: 12,
        center: {lat: 35, lng: 0},
        mapTypeId: google.maps.MapTypeId.SATELLITE,
        fullscreenControl: true
      });
      document.getElementById("fermeSelectRight").selectedIndex = 0;
      document.getElementById("indexSelectRight").selectedIndex = 0;
      setupDatePicker("datePickerRight", "right");
      afficherPolygoneRight(0);
    }
    mapContainer.classList.add("split");
    document.getElementById("rightMap").style.display = "block";
    afficherNDVICommun();
  } else {
    farmSelectRight.style.display = "none";
    indexSelectRight.style.display = "none";
    datePickerRight.style.display = "none";
    document.getElementById("rightMap").style.display = "none";
    mapContainer.classList.remove("split");
    document.getElementById("leftMap").style.width = "100%";
    afficherNDVICommun();
  }
}

// Place le marqueur d'observation au centre de la ferme sélectionnée (côté gauche)
function placeObservationMarkerAtFarm() {
  const bounds = getBoundsForPivot(leftPivotID);
  if (bounds) {
    const center = bounds.getCenter();
    if (observationMarker) {
      observationMarker.setPosition(center);
    } else {
      observationMarker = new google.maps.Marker({
        position: center,
        map: leftMap,
        draggable: true,
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
          scaledSize: new google.maps.Size(32, 32)
        }
      });
      observationMarker.addListener('dragend', (e) => {
        updateCoordinatesDisplay(e.latLng);
      });
    }
    updateCoordinatesDisplay(center);
    setupCoordinateUpdate();
  }
}

// Gestion du mode d'observation via le bouton
function toggleObservationMode() {
  const btn = document.getElementById('toggleObservationBtn');
  if (!isObservationMode) {
    // Activer le mode observation
    isObservationMode = true;
    btn.textContent = '❌ Annuler l\'ajout';
    btn.style.backgroundColor = '#EA4335';
    document.getElementById('coordsBox').style.display = 'block';
    placeObservationMarkerAtFarm();
  } else {
    // Annuler le mode observation et supprimer le marqueur
    isObservationMode = false;
    btn.textContent = '📍 Ajouter un point d\'observation';
    btn.style.backgroundColor = '#DEB887';
    document.getElementById('coordsBox').style.display = 'none';
    if (observationMarker) {
      observationMarker.setMap(null);
      observationMarker = null;
    }
    if (coordinatesDisplayTimeout) {
      clearTimeout(coordinatesDisplayTimeout);
      coordinatesDisplayTimeout = null;
    }
  }
}

function updateCoordinatesDisplay(latLng) {
  const display = document.getElementById('coordinatesDisplay');
  const lat = latLng.lat().toFixed(6);
  const lng = latLng.lng().toFixed(6);
  display.innerHTML = `${lat}<br>${lng}`;
}

function setupCoordinateUpdate() {
  if (coordinatesDisplayTimeout) clearTimeout(coordinatesDisplayTimeout);
  coordinatesDisplayTimeout = setInterval(() => {
    if (observationMarker) {
      updateCoordinatesDisplay(observationMarker.getPosition());
    }
  }, 100);
}

// Fonction pour copier les coordonnées dans le presse-papiers
function copyCoordinates() {
  const coords = document.getElementById('coordinatesDisplay').innerText;
  navigator.clipboard.writeText(coords)
    .then(() => alert('Coordonnées copiées !'))
    .catch(err => console.error('Erreur lors de la copie:', err));
}
