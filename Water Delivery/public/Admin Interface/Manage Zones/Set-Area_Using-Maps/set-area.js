// Initialize map and variables
let map;
let geocoder;
let drawingManager;
let searchedArea = null;
let drawnPolygons = [];

// Initialize Google Map
function initMap() {
    // Default location: Jordan
    const defaultLocation = { lat: 31.5, lng: 35.8 };
    
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 7,
        center: defaultLocation,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        fullscreenControl: true,
        streetViewControl: true
    });

    // Initialize geocoder
    geocoder = new google.maps.Geocoder();

    // Initialize Drawing Manager
    drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: true,
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON, google.maps.drawing.OverlayType.RECTANGLE]
        },
        polygonOptions: {
            fillColor: '#667eea',
            fillOpacity: 0.2,
            strokeColor: '#667eea',
            strokeWeight: 2,
            editable: true,
            draggable: true
        },
        rectangleOptions: {
            fillColor: '#667eea',
            fillOpacity: 0.2,
            strokeColor: '#667eea',
            strokeWeight: 2,
            editable: true,
            draggable: true
        }
    });
    
    drawingManager.setMap(map);

    // Listen to drawing manager events
    google.maps.event.addListener(drawingManager, 'polygoncomplete', onShapeComplete);
    google.maps.event.addListener(drawingManager, 'rectanglecomplete', onShapeComplete);
}

// Handle shape completion
function onShapeComplete(shape) {
    shape.setEditable(true);
    drawnPolygons.push(shape);
    updateStatus('Area created. Click "Save Area" to confirm.');
}

// Search for location using Google Geocoding API
function searchLocation(locationName) {
    if (!locationName.trim()) {
        updateSearchStatus('Please enter a location name', 'error');
        return;
    }

    updateSearchStatus('Searching for "' + locationName + '"...', 'info');
    document.getElementById('searchBtn').disabled = true;

    geocoder.geocode({ 
        address: locationName,
        componentRestrictions: { country: 'JO' }
    }, function(results, status) {
        document.getElementById('searchBtn').disabled = false;

        if (status !== google.maps.GeocoderStatus.OK) {
            console.error('Geocoding error:', status);
            if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
                updateSearchStatus('Location "' + locationName + '" not found in Jordan. Try another name or draw manually.', 'error');
            } else if (status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
                updateSearchStatus('Search limit reached. Please try again in a moment.', 'error');
            } else if (status === google.maps.GeocoderStatus.REQUEST_DENIED) {
                updateSearchStatus('Search service unavailable. Check API key.', 'error');
            } else {
                updateSearchStatus('Search failed: ' + status, 'error');
            }
            return;
        }

        if (!results || results.length === 0) {
            updateSearchStatus('Location "' + locationName + '" not found in Jordan. Try another name or draw manually.', 'error');
            return;
        }

        const result = results[0];
        let bounds = result.geometry.bounds;
        const location = result.geometry.location;
        
        // If no bounds, create a rectangle around the point (2.5km radius)
        if (!bounds) {
            const offsetLat = 0.025; // ~2.5km at equator
            const offsetLng = 0.035; // ~2.5km at Jordan's latitude
            bounds = new google.maps.LatLngBounds(
                new google.maps.LatLng(location.lat() - offsetLat, location.lng() - offsetLng),
                new google.maps.LatLng(location.lat() + offsetLat, location.lng() + offsetLng)
            );
        }
        
        // Clear previous shapes and search
        clearAllShapes();

        // Draw rectangle from bounds
        const rectangle = new google.maps.Rectangle({
            bounds: bounds,
            fillColor: '#667eea',
            fillOpacity: 0.2,
            strokeColor: '#667eea',
            strokeWeight: 2,
            editable: true,
            draggable: true,
            map: map
        });

        drawnPolygons.push(rectangle);
        map.fitBounds(bounds);
        searchedArea = rectangle;

        // Auto-populate area name
        document.getElementById('areaNameInput').value = result.formatted_address || locationName;
        
        updateSearchStatus(`✓ "${result.formatted_address}" loaded! Boundaries are now shown on the map.`, 'success');
    });
}

// Get coordinates from drawn shapes
function getAreaCoordinates() {
    const coordinates = [];

    for (let shape of drawnPolygons) {
        if (shape instanceof google.maps.Polygon) {
            const path = shape.getPath();
            path.forEach(point => {
                coordinates.push({
                    lat: point.lat(),
                    lng: point.lng()
                });
            });
        } else if (shape instanceof google.maps.Rectangle) {
            const bounds = shape.getBounds();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            
            coordinates.push({ lat: ne.lat(), lng: sw.lng() }); // NW
            coordinates.push({ lat: ne.lat(), lng: ne.lng() }); // NE
            coordinates.push({ lat: sw.lat(), lng: ne.lng() }); // SE
            coordinates.push({ lat: sw.lat(), lng: sw.lng() }); // SW
        }
    }

    return coordinates;
}

// Save area and send to parent
function saveArea() {
    const areaName = document.getElementById('areaNameInput').value.trim();
    const coordinates = getAreaCoordinates();
    
    if (!areaName) {
        updateStatus('Please enter an area name!', 'error');
        return;
    }

    if (coordinates.length === 0) {
        updateStatus('Please search for an area or draw first!', 'error');
        return;
    }

    if (coordinates.length < 3) {
        updateStatus('Area must have at least 3 points!', 'error');
        return;
    }

    // Send data back to parent window
    const areaData = {
        type: 'areaSelected',
        areaName: areaName,
        coordinates: coordinates,
        timestamp: new Date().toISOString()
    };

    window.parent.postMessage(areaData, '*');
    updateStatus('Area "' + areaName + '" saved and sent!', 'success');
}

// Clear all drawn shapes
function clearAllShapes() {
    for (let shape of drawnPolygons) {
        shape.setMap(null);
    }
    drawnPolygons = [];
    searchedArea = null;
}

// Clear button handler
function clearArea() {
    clearAllShapes();
    drawingManager.setDrawingMode(null);
    updateStatus('Area cleared.');
}

// Cancel action
function cancelAction() {
    window.parent.postMessage({
        type: 'areaCancelled',
        timestamp: new Date().toISOString()
    }, '*');
}

// Update status messages
function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}

function updateSearchStatus(message, type = 'info') {
    const statusEl = document.getElementById('searchStatus');
    statusEl.textContent = message;
    statusEl.className = 'search-status ' + type;
}

// Event listeners
document.getElementById('searchBtn').addEventListener('click', function() {
    const locationName = document.getElementById('locationInput').value;
    searchLocation(locationName);
});

// Search on Enter key
document.getElementById('locationInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchLocation(this.value);
    }
});

document.getElementById('saveBtn').addEventListener('click', saveArea);
document.getElementById('clearBtn').addEventListener('click', clearArea);
document.getElementById('cancelBtn').addEventListener('click', cancelAction);

// Initialize map when page loads
window.addEventListener('load', initMap);
