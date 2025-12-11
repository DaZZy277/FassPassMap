// src/app/component/map-view.component.ts

import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
// CRITICAL: NO STATIC LEAFLET IMPORT
import { MapService, TargetLocation, MapZone, SearchResult, PositionMode, UniversityMode } from '../../services/map-service'; 

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="app-container">
      
      <div id="map" class="map-canvas"></div>

      <div class="top-overlay-container">
        
        <div class="mode-control-wrapper university-selector">
            <div class="mode-switch-group">
                <button 
                    [class.active]="mapService.universityMode === 'KMITL'" 
                    (click)="switchUniversityMode('KMITL')"
                >KMITL</button>
                <button 
                    [class.active]="mapService.universityMode === 'KMUTT'" 
                    (click)="switchUniversityMode('KMUTT')"
                >KMUTT</button>
            </div>
        </div>

        <div class="mode-control-wrapper">
            <div class="mode-switch-group">
                <button 
                    [class.active]="mapService.positionMode === 'GPS'" 
                    (click)="setMode('GPS')"
                >GPS (Auto)</button>
                <button 
                    [class.active]="mapService.positionMode === 'MANUAL'" 
                    (click)="setMode('MANUAL')"
                >Manual</button>
            </div>
            
            <div *ngIf="mapService.positionMode === 'MANUAL'" class="manual-input-group">
                <input type="number" placeholder="Latitude" [(ngModel)]="manualLat">
                <input type="number" placeholder="Longitude" [(ngModel)]="manualLng">
                <button (click)="submitManualPosition()">Apply</button>
            </div>
        </div>
        
        <div class="search-wrapper">
            <div class="search-bar">
                <span class="search-icon">🔍</span>
                <input 
                    type="text" 
                    placeholder="ค้นหาสถานที่..." 
                    class="search-input" 
                    #searchInput
                    (input)="onSearchInput(searchInput.value)"
                    (focus)="showSuggestions = true"
                    [value]="currentSearchQuery"
                >
                <span *ngIf="currentSearchQuery" class="clear-icon" (click)="clearSearch()">✕</span>
            </div>

            <div class="search-suggestions" *ngIf="showSuggestions && (searchResults.length > 0 || isSearching)">
                <div class="suggestion-item loading" *ngIf="isSearching">
                    <span class="spinner-small"></span> กำลังค้นหา...
                </div>
                <div *ngFor="let result of searchResults" class="suggestion-item" (click)="selectSearchResult(result)">
                    <span class="suggestion-icon">{{ result.isLocal ? '🏛️' : '📍' }}</span>
                    <div class="suggestion-text">
                        <div class="suggestion-name">{{ result.name }}</div>
                        <div class="suggestion-address">{{ result.address }}</div>
                    </div>
                </div>
            </div>
            
            <p *ngIf="searchError" class="search-error-message">
                ⚠️ {{ searchError }}
            </p>
        </div>

        <div class="zone-selector-wrapper">
            <label>เลือกพื้นที่:</label>
            <select #zoneSelect (change)="focusOnSelectedZone(zoneSelect.value)" class="zone-select">
                <option *ngFor="let zone of zones" [value]="zone.hash">
                    {{ zone.name }}
                </option>
            </select>
        </div>
        
      </div>
      
      <div class="fab-container">
        <button class="location-fab" (click)="focusOnUser()" title="ตำแหน่งปัจจุบัน">
          <span class="fab-icon">🎯</span>
        </button>
      </div>

      <div class="bottom-overlay-container" [class.expanded]="isSheetExpanded">
        <div class="sliding-sheet">
            <div class="drag-handle-area" (click)="toggleSheet()">
                <div class="drag-handle"></div>
            </div>
            
            <div class="location-details-view" *ngIf="selectedLocation">
                <div class="details-header">
                    <button class="back-btn" (click)="clearSelection()">← กลับ</button>
                    <h2 class="details-title-wrapper">
                        <span class="color-dot" [style.backgroundColor]="selectedLocation.color"></span>
                        <span class="details-title">{{ selectedLocation.name }}</span>
                    </h2>
                </div>
                
                <div class="details-content">
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <span class="detail-text">{{ selectedLocation.latlng[0].toFixed(5) }}, {{ selectedLocation.latlng[1].toFixed(5) }}</span>
                    </div>
                    <div class="detail-row" *ngIf="selectedLocation.distanceText">
                        <span class="detail-icon">📏</span>
                        <span class="detail-text">ห่างจากคุณ {{ selectedLocation.distanceText }}</span>
                    </div>
                    <div class="detail-row" *ngIf="selectedLocation.description">
                        <span class="detail-icon">ℹ️</span>
                        <span class="detail-text">{{ selectedLocation.description }}</span>
                    </div>
                    
                    <div class="action-buttons">
                        <a [href]="getGoogleMapsLink(selectedLocation.latlng[0], selectedLocation.latlng[1])" 
                           target="_blank" 
                           class="primary-btn">
                           เปิดใน Google Maps ↗
                        </a>
                    </div>
                </div>
            </div>

            <div class="default-list-view" *ngIf="!selectedLocation">
                <div class="section-header">
                    <h3>สถานที่แนะนำ ({{ mapService.universityMode }})</h3>
                </div>
                <div class="location-list">
                    <div *ngFor="let target of targets" class="list-item" (click)="onLocationSelect(target)">
                        <span class="list-rank" [style.backgroundColor]="target.color">{{ target.rank }}</span>
                        <div class="list-text">
                            <div class="list-name">{{ target.name }}</div>
                            <div class="list-sub">
                                <span class="distance-badge" *ngIf="target.distanceText">📏 {{ target.distanceText }}</span>
                            </div>
                        </div>
                        <button class="navigate-btn">ดู</button>
                    </div>
                </div>
                
                <div class="user-mini-status" *ngIf="mapService.userGeoHash">
                    <small>ตำแหน่งของคุณ: {{ mapService.userLat?.toFixed(4) }}, {{ mapService.userLng?.toFixed(4) }} ({{ mapService.userGeoHash }})</small>
                </div>
            </div>

        </div>
      </div>
    </div>
  `,
styleUrls: [`./map-view.component.css`]

})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
    
    private map: any;
    private userMarker: any;
    private searchMarker: any; 
    private geoHashBounds: any;
    private L: any; 
    private targetsSubscription: Subscription | null = null;
    private searchResultsSubscription: Subscription | null = null;
    private isSearchingSubscription: Subscription | null = null;

    isSheetExpanded: boolean = false; 
    isSearching: boolean = false; 
    showSuggestions: boolean = false;
    currentSearchQuery: string = '';
    searchError: string | null = null;
    searchResults: SearchResult[] = [];
    selectedLocation: TargetLocation | null = null;

    targets: TargetLocation[] = []; 
    zones: MapZone[] = []; 
    
    manualLat: number | null = 13.7280;
    manualLng: number | null = 100.7765;

    private searchSubject = new Subject<string>();

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        public mapService: MapService
    ) {
        this.zones = this.mapService.zones;
    }

    // --- INTERACTION METHODS (PUBLIC/UI) ---
    public toggleSheet(): void {
        this.isSheetExpanded = !this.isSheetExpanded;
    }

    public clearSelection(): void {
        this.selectedLocation = null;
    }
    
    public getGoogleMapsLink(lat: number, lng: number): string {
        if (lat === null || lng === null) return '#';
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    public async onLocationSelect(target: TargetLocation): Promise<void> {
        this.selectedLocation = target;
        this.isSheetExpanded = true; 
        
        if (isPlatformBrowser(this.platformId) && this.map && this.L) {
            this.map.flyTo(target.latlng, 18, { duration: 1.5 });
            if (this.searchMarker) {
                this.map.removeLayer(this.searchMarker);
                this.searchMarker = undefined;
            }
        }
    }
    
    public async focusOnSelectedZone(hash: string): Promise<void> {
        if (!hash || !this.map || !this.L || !this.mapService.isNgeohashInitialized()) return;
        
        const boundsArray = this.mapService.decodeGeoHashBounds(hash);
        if (!boundsArray) return;
        
        const bounds: any = [
            [boundsArray[0], boundsArray[1]], // [minLat, minLng]
            [boundsArray[2], boundsArray[3]]  // [maxLat, maxLng]
        ];
        
        this.map.fitBounds(bounds, { padding: [10, 10], duration: 1.2 });
        this.isSheetExpanded = false;

        if (this.geoHashBounds) this.map.removeLayer(this.geoHashBounds);
        this.geoHashBounds = this.L.rectangle(bounds, {
            color: '#1a73e8',
            weight: 3,
            fillOpacity: 0.1,
            fillColor: '#1a73e8'
        }).addTo(this.map);
    }
    
    public focusOnUser(): void {
        if (this.map && this.mapService.userLat !== null && this.mapService.userLng !== null) {
            this.map.flyTo([this.mapService.userLat, this.mapService.userLng], 18);
            this.selectedLocation = null;
            this.isSheetExpanded = false;
        }
    }

    // --- Search Logic Handlers (Delegating to service) ---
    public onSearchInput(query: string): void {
        this.currentSearchQuery = query;
        this.showSuggestions = true;
        this.mapService.pushSearchQuery(query); 
    }

    public clearSearch(): void {
        this.currentSearchQuery = '';
        this.searchResults = [];
        this.showSuggestions = false;
        this.mapService.pushSearchQuery('');
    }
    
    public async selectSearchResult(result: SearchResult): Promise<void> {
        this.showSuggestions = false;
        this.currentSearchQuery = result.name;
        
        const target: TargetLocation = {
            name: result.name,
            latlng: [result.lat, result.lng],
            id: result.id || 'search_temp_pin',
            description: result.address,
            color: result.isLocal ? (this.targets.find(t => t.id === result.id)?.color || '#FF0000') : '#FF0000',
            distance: undefined,
            mapMarker: undefined,
            rank: undefined
        };
        
        await this.onLocationSelect(target);

        if (!result.isLocal && this.L && this.map) {
            if (this.searchMarker) {
                this.map.removeLayer(this.searchMarker);
            }
            const icon = this.mapService.createPinIcon(this.L, target.color);
            this.searchMarker = this.L.marker(target.latlng, { icon: icon }).addTo(this.map)
                .bindPopup(`<b>${target.name}</b>`).openPopup();
        }
    }

    // --- Position Mode Logic ---
    public setMode(mode: PositionMode): void {
        if (this.mapService.positionMode === mode) return;

        this.mapService.positionMode = mode;
        
        if (mode === 'GPS') {
            if (this.L) {
                this.mapService.startGeolocationTracking(this.L);
            }
        } else {
            this.mapService.stopTracking(); 
            if (this.L) {
                this.submitManualPosition(); 
            }
        }
    }

    public submitManualPosition(): void {
        if (!this.L || this.manualLat === null || this.manualLng === null) {
            this.searchError = "Invalid coordinates.";
            return;
        }
        this.searchError = null;
        this.mapService.setManualPosition(this.manualLat, this.manualLng, this.L);
        this.focusOnUser(); 
    }
    
    public switchUniversityMode(mode: UniversityMode): void {
        if (this.L) {
            this.mapService.switchUniversity(mode, this.L);
            
            this.clearAllMarkers();
            this.initMarkers(this.L);
            
            const targetHash = (mode === 'KMITL' ? 'w4rwj' : 'w4rmw');
            this.focusOnSelectedZone(targetHash);
        }
        this.clearSelection();
    }
    
    private clearAllMarkers(): void {
        if (this.map && this.L) {
            this.targets.forEach(target => {
                if (target.mapMarker) {
                    this.map.removeLayer(target.mapMarker);
                    target.mapMarker = undefined;
                }
            });
            if (this.userMarker) {
                this.map.removeLayer(this.userMarker);
                this.userMarker = undefined;
            }
            if (this.geoHashBounds) {
                this.map.removeLayer(this.geoHashBounds);
                this.geoHashBounds = undefined;
            }
            if (this.searchMarker) {
                this.map.removeLayer(this.searchMarker);
                this.searchMarker = undefined;
            }
        }
    }

    private initMarkers(L_local: any): void {
        this.targets = this.mapService.targetsSubject.getValue();

        this.targets.forEach(target => {
            const targetIcon = this.mapService.createRankedPinIcon(L_local, target.color || '#007bff', 0); 
            const marker = L_local.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
            target.mapMarker = marker;
            marker.on('click', () => this.onLocationSelect(target));
        });
        this.updateUserUI(L_local); 
    }


    // --- CORE MAP & DATA FLOW ---
    private initMap(L_local: any): boolean {
        this.L = L_local;
        const mapElement = document.getElementById('map');
        if (!mapElement) { return false; }
        const defaultCenter: [number, number] = [13.72766661420566, 100.77253069896474];
        if (this.map) { this.map.remove(); this.map = null; }
        this.map = L_local.map('map', { center: defaultCenter, zoom: 15, zoomControl: false });
        L_local.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.map);
        
        this.targets = this.mapService.targetsSubject.getValue();
        this.initMarkers(L_local);

        setTimeout(() => { if (this.map) { this.map.invalidateSize(); } }, 500);
        return true; 
    }

    private setupTargetsSubscription(L_local: any): void {
        this.targetsSubscription = this.mapService.targets$.subscribe(targets => {
            this.targets = targets; 
            
            targets.forEach(target => {
                if (target.mapMarker) {
                    const newIcon = this.mapService.createRankedPinIcon(L_local, target.color, target.rank || 0);
                    target.mapMarker.setIcon(newIcon);
                }
            });

            this.updateUserUI(L_local);
        });
        
        this.searchResultsSubscription = this.mapService.searchResults$.subscribe(results => {
            this.searchResults = results;
        });

        this.isSearchingSubscription = this.mapService.isSearching$.subscribe(isSearching => {
            this.isSearching = isSearching;
        });
    }

    private updateUserUI(L_local: any): void {
        const userLat = this.mapService.userLat;
        const userLng = this.mapService.userLng;
        const userGeoHash = this.mapService.userGeoHash;
        
        if (userLat === null || userLng === null || !this.map) return;

        if (!this.userMarker) { 
            const userIcon = this.mapService.createUserIcon(L_local);
            this.userMarker = L_local.marker([userLat, userLng], { icon: userIcon }).addTo(this.map);
        } else {
            this.userMarker.setLatLng([userLat, userLng]);
        }

        if (userGeoHash && this.mapService.isNgeohashInitialized()) { 
            if (this.geoHashBounds) this.map.removeLayer(this.geoHashBounds); 
            const boundsArray = this.mapService.decodeGeoHashBounds(userGeoHash);
            const bounds: any = [[boundsArray[0], boundsArray[1]], [boundsArray[2], boundsArray[3]]];
            this.geoHashBounds = this.L.rectangle(bounds, { color: '#4285f4', weight: 2, fillOpacity: 0.15, fillColor: '#4285f4' }).addTo(this.map);
        }
    }


    // --- Final Lifecycle ---
    ngOnInit(): void {
        // Search debounce handled inside MapService via pushSearchQuery
    }

    async ngAfterViewInit(): Promise<void> {
        if (isPlatformBrowser(this.platformId)) {
            const LeafletModule = await import('leaflet');
            const L_local = (LeafletModule as any).default || LeafletModule;
            
            await this.mapService.initializeGeoHash();

            setTimeout(() => {
                const success = this.initMap(L_local);
                if (success) {
                    this.setupTargetsSubscription(L_local);
                    
                    if (this.mapService.positionMode === 'GPS') {
                        this.mapService.startGeolocationTracking(L_local);
                    } else {
                        this.submitManualPosition(); 
                    }
                }
            }, 200); 
        }
    }

    ngOnDestroy(): void {
        this.mapService.stopTracking();
        if (this.targetsSubscription) this.targetsSubscription.unsubscribe();
        if (this.searchResultsSubscription) this.searchResultsSubscription.unsubscribe();
        if (this.isSearchingSubscription) this.isSearchingSubscription.unsubscribe();
        if (this.map) this.map.remove(); 
    }
}