// Handle messages from the Set-Area iframe
window.addEventListener('message', function(event) {
    // Validate the origin for security (optional but recommended)
    // if (event.origin !== window.location.origin) return;

    const data = event.data;

    if (data.type === 'areaSelected') {
        // Area was successfully selected
        console.log('Area name received:', data.areaName);
        console.log('Area coordinates received:', data.coordinates);
        
        // Display the coordinates and area name
        displayAreaCoordinates(data.coordinates, data.areaName);
        
        // Store the coordinates and area name in data attributes for later use
        document.getElementById('areaCoordinates').dataset.coordinates = JSON.stringify(data.coordinates);
        document.getElementById('areaCoordinates').dataset.areaName = data.areaName;
        
        // You can also auto-fill the location field
        console.log('Area saved at:', data.timestamp);
    } 
    else if (data.type === 'areaCancelled') {
        console.log('Area selection cancelled');
        // Clear any existing coordinates display
        document.getElementById('areaCoordinates').style.display = 'none';
    }
});

// Function to display coordinates and area name on the page
function displayAreaCoordinates(coordinates, areaName = '') {
    const coordDisplay = document.getElementById('areaCoordinates');
    const coordList = document.getElementById('coordinatesList');
    
    let html = '<strong>' + (areaName ? 'Area: ' + areaName : 'Coordinates') + '</strong><br>';
    html += '<small>Total Points: ' + coordinates.length + '</small><br><br>';
    coordinates.forEach((coord, index) => {
        html += `Point ${index + 1}: ${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}<br>`;
    });
    
    coordList.innerHTML = html;
    coordDisplay.style.display = 'block';
}

// Optional: Function to get the stored area coordinates when needed
function getAreaCoordinates() {
    const coordData = document.getElementById('areaCoordinates').dataset.coordinates;
    if (coordData) {
        return JSON.parse(coordData);
    }
    return null;
}

// Optional: Function to get the area name
function getAreaName() {
    return document.getElementById('areaCoordinates').dataset.areaName || '';
}
