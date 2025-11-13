import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import 'leaflet/dist/leaflet.css';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-container">
      <h1 class="page-title">Location Tracker</h1> 
      
      <div class="map-card">
        <div id="map" class="map-canvas"></div>
      </div>

      <div class="info-card">
        <h3 class="info-header">Current Location Details</h3>

        <div *ngIf="userGeoHash">
          <div class="data-row">
            <span class="label">Latitude:</span>
            <span class="value">{{ userLat?.toFixed(5) }}</span>
          </div>
          <div class="data-row">
            <span class="label">Longitude:</span>
            <span class="value">{{ userLng?.toFixed(5) }}</span>
          </div>
          <div class="data-row">
            <span class="label">GeoHash (Precision 8):</span>
            <span class="value hash">{{ userGeoHash }}</span>
          </div>
        </div>

        <p *ngIf="!userGeoHash && !errorMessage" class="message loading-message">
          <span class="spinner"></span> Locating user and initializing map...
        </p>

        <p *ngIf="errorMessage" class="message error-message">
          ⚠️ {{ errorMessage }}
        </p>
      </div>
    </div>
  `,
  styles: [
    `
    /* General Mobile/Google-Style Optimization */
    .app-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 0; /* Reduced vertical padding for mobile */
      background-color: #f1f1f1; /* Light gray background, like Google UI */
      min-height: 100vh;
      font-family: 'Roboto', sans-serif; /* Recommended Google font */
    }
    .page-title {
      color: #1a73e8; /* Google Blue */
      margin-top: 15px;
      margin-bottom: 15px;
      font-weight: 500;
      font-size: 1.5rem; /* Smaller title for mobile */
    }
    .map-card {
      width: 98vw; /* Use viewport width for full mobile screen coverage */
      max-width: 1000px;
      height: 60vh; /* Use viewport height for map space */
      border-radius: 8px; /* Slightly reduced radius for modern look */
      overflow: hidden;
      /* Flat, subtle shadow for modern feel */
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); 
      margin-bottom: 20px;
      background-color: #fff;
    }
    #map { 
      width: 100%; 
      height: 100%; 
    }
    
    .info-card {
      width: 95vw; /* Use viewport width */
      max-width: 500px; /* Kept max-width for desktop but lets mobile stretch */
      padding: 20px;
      border-radius: 8px;
      background-color: #ffffff;
      /* Subtle shadow */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); 
      border-left: none; /* Removed accent bar for cleaner look */
    }
    .info-header {
      margin-top: 0;
      margin-bottom: 15px;
      color: #1a73e8; /* Google Blue */
      font-weight: 500;
      border-bottom: 1px solid #e9ecef;
      padding-bottom: 8px;
      font-size: 1.1rem;
    }
    .data-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: none; /* Removed separator for cleaner lists */
    }
    .label {
      font-weight: 400;
      color: #5f6368; /* Google gray */
    }
    .value {
      font-weight: 500;
      color: #202124;
    }
    .hash {
      font-family: 'monospace';
      color: #1e8e3e; /* Google Green for success/data */
    }
    /* Rest of the styles (message, spinner) are fine */
    .message {
      /* ... */
    }
    .loading-message {
      /* ... */
    }
    .error-message {
      /* ... */
    }
    .spinner {
      /* ... */
    }
    @keyframes spin {
      /* ... */
    }
    `
  ]
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
  private map: any;
  private userMarker: any;
  private ngeohash: any;
  private geoHashBounds: any; 
  private centroid: [number, number] = [42.3601, -71.0589]; 
  private updateInterval: any;

  userLat: number | null = null;
  userLng: number | null = null;
  userGeoHash: string | null = null;
  errorMessage: string | null = null; 

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const L = await import('leaflet');
    this.ngeohash = await import('ngeohash');
    this.initMap(L);
    this.startLocationInterval(L);
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId) && this.map) {
      setTimeout(() => {
        if (this.map) { 
          this.map.invalidateSize();
        }
      }, 50);
    }
  }

  ngOnDestroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.map) {
      this.map.remove(); 
    }
  }

  private initMap(L: any) {
    this.map = L.map('map', {
      center: this.centroid,
      zoom: 12
    });

    // 🏆 FIX: Switched to CartoDB Positron for a light, Google Maps-like aesthetic
    // Replace the light_all tiles with the brighter Voyager tiles:
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    setTimeout(() => {
      if (this.map) { 
        this.map.invalidateSize();
      }
    }, 2000); 
  }

  private startLocationInterval(L: any) {
    const updateLocation = () => {
      if (!navigator.geolocation) {
        this.errorMessage = 'Geolocation is not supported by your browser.';
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const hash = this.ngeohash.encode(lat, lng, 8); 

          this.userLat = lat;
          this.userLng = lng;
          this.userGeoHash = hash;
          this.errorMessage = null; 

          const userLocation: [number, number] = [lat, lng];

          if (!this.userMarker) {
            this.map.setView(userLocation, 18);
          }

          // 1. Update/Add User Marker
          if (this.userMarker) this.map.removeLayer(this.userMarker);

          // We should use a simple, modern SVG icon for better mobile performance/look
          const userIcon = L.icon({
             iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%231a73e8" width="40px" height="40px"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="white"/></svg>',
             iconSize: [40, 40],
             iconAnchor: [20, 20],
          });


          this.userMarker = L.marker(userLocation, { icon: userIcon })
            .addTo(this.map)
            .bindPopup(`<b>You are here</b><br>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}<br>GeoHash: ${hash}`)
            .openPopup();
            
          // 2. Update GEOHASH BOUNDING BOX
          if (this.geoHashBounds) {
              this.map.removeLayer(this.geoHashBounds); 
          }
          
          const boundsArray = this.ngeohash.decode_bbox(hash); 
          const bounds: L.LatLngBoundsExpression = [
              [boundsArray[0], boundsArray[1]], 
              [boundsArray[2], boundsArray[3]]  
          ];
          
          // Using a subtle blue color palette for the bounds
          this.geoHashBounds = L.rectangle(bounds, {
              color: '#4285f4', // Google Blue
              weight: 2,
              fillOpacity: 0.1,
              fillColor: '#4285f4'
          }).addTo(this.map);
        },
        (error) => {
          console.error('Error getting location:', error);
          if (error.code === 1) {
              this.errorMessage = 'Geolocation permission denied. Please enable location services in your browser.';
          } else {
              this.errorMessage = 'Could not retrieve location data.';
          }
        },
        { enableHighAccuracy: true }
      );
    };

    updateLocation();
    this.updateInterval = setInterval(updateLocation, 500000); 
  }
}