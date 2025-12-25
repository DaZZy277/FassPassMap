import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { Subject, Subscription } from 'rxjs';
import { MapService, TargetLocation, MapZone, SearchResult, PositionMode } from '../../services/map-service'; 

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="app-container">
      
      <div id="map" class="map-canvas"></div>

      <div class="top-overlay-container">
        
        <div class="search-wrapper" [class.active-search]="isSearchActive">
            <div class="search-bar">
                <button *ngIf="isSearchActive" class="back-btn" (click)="closeSearch()">←</button>
                <span class="search-icon" *ngIf="!isSearchActive">🔍</span>
                <input 
                    type="text" 
                    placeholder="ค้นหาอาคาร (ทั้งหมด)..." 
                    class="search-input" 
                    #searchInput
                    (focus)="activateSearch()"
                    (input)="onSearchInput(searchInput.value)"
                    [value]="currentSearchQuery"
                >
                <span *ngIf="currentSearchQuery" class="clear-icon" (click)="clearSearch()">✕</span>
            </div>

            <div class="search-overlay" *ngIf="isSearchActive">
                
                <div class="results-list">
                    <div class="list-header">
                        {{ currentSearchQuery ? 'ผลลัพธ์การค้นหา' : 'สถานที่ทั้งหมด' }}
                    </div>
                    
                    <div *ngFor="let item of displayList" class="result-item" (click)="handleItemSelect(item)">
                        <span class="item-icon">
                            <ng-container *ngIf="isTarget(item)">
                                <span class="color-dot" [style.backgroundColor]="item.color"></span>
                            </ng-container>
                            <ng-container *ngIf="!isTarget(item)">📍</ng-container>
                        </span>
                        <div class="item-text">
                            <div class="item-name">{{ item.name }}</div>
                            <div class="item-sub">
                                <span class="distance-badge" *ngIf="isTarget(item) && item.distanceText">{{ item.distanceText }}</span>
                                {{ isTarget(item) ? item.description : item.address }}
                            </div>
                        </div>
                    </div>

                    <div class="suggestion-card" *ngIf="nearestLocation" (click)="handleItemSelect(nearestLocation)">
                        <div class="card-icon">📍</div>
                        <div class="card-info">
                            <div class="card-title">แนะนำ (ใกล้ที่สุด)</div>
                            <div class="card-name">{{ nearestLocation.name }}</div>
                            <div class="card-sub">{{ nearestLocation.distanceText }}</div>
                        </div>
                    </div>

                    <div class="empty-state" *ngIf="currentSearchQuery && displayList.length === 0" style="padding: 20px; text-align: center; color: #999;">
                        ไม่พบข้อมูล
                    </div>
                </div>
            </div>
        </div>
        
        <!-- <ng-container *ngIf="!isSearchActive">
            <div class="mode-control-wrapper">
                <div class="zone-row">
                    <select #zoneSelect (change)="focusOnSelectedZone(zoneSelect.value)" class="zone-select">
                        <option value="" disabled selected>-- ไปยังวิทยาเขต --</option>
                        <option *ngFor="let zone of zones" [value]="zone.hash">{{ zone.name }}</option>
                    </select>
                </div>
            </div>

            <div class="mode-control-wrapper">
                <div class="mode-switch-group">
                    <button [class.active]="mapService.positionMode === 'GPS'" (click)="setMode('GPS')">GPS</button>
                    <button [class.active]="mapService.positionMode === 'MANUAL'" (click)="setMode('MANUAL')">Manual</button>
                </div>
                <div *ngIf="mapService.positionMode === 'MANUAL'" class="manual-input-group">
                    <input type="number" placeholder="Lat" [(ngModel)]="manualLat">
                    <input type="number" placeholder="Lng" [(ngModel)]="manualLng">
                    <button (click)="submitManualPosition()">Go</button>
                </div>
            </div>
        </ng-container> -->
      </div>
      
      <div class="fab-container" *ngIf="!isSearchActive">
        <button class="location-fab" (click)="focusOnUser()" title="ตำแหน่งปัจจุบัน">
          <span class="fab-icon">🎯</span>
        </button>
      </div>

      <div class="bottom-sheet-container" 
           [class.expanded]="isSheetExpanded || selectedLocation"
           *ngIf="!isSearchActive">
           
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
                    <div class="detail-row" *ngIf="selectedLocation.distanceText">
                        <span class="detail-icon">📏</span>
                        <span class="detail-text">ห่างจากคุณ {{ selectedLocation.distanceText }}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">ℹ️</span>
                        <span class="detail-text">{{ selectedLocation.description }}</span>
                    </div>
                    <div class="action-buttons">
                        <a [href]="getGoogleMapsLink(selectedLocation.latlng[0], selectedLocation.latlng[1])" 
                           target="_blank" class="navigate-btn">
                           เปิดใน Google Maps ↗
                        </a>
                    </div>
                </div>
            </div>

            <div class="default-list-view" *ngIf="!selectedLocation">
                <div class="section-header">
                    <!-- <h3>สถานที่ทั้งหมด (เรียงตามระยะทาง)</h3> -->
                </div>
                <div class="location-list">
                    <div *ngFor="let target of targets; let i = index" class="list-item" (click)="onLocationSelect(target)">
                        <span class="list-rank" [style.backgroundColor]="target.color">{{ target.rank || (i + 1) }}</span>
                        <div class="list-text">
                            <div class="list-name">{{ target.name }}</div>
                            <div class="list-sub">
                                <span class="distance-badge" *ngIf="target.distanceText">{{ target.distanceText }}</span>
                            </div>
                        </div>
                        <button class="navigate-btn-small">ดู</button>
                    </div>
                </div>
                <div class="user-mini-status">
                    <small>Lat: {{ mapService.userLat?.toFixed(4) }}, Lng: {{ mapService.userLng?.toFixed(4) }}</small>
                </div>
            </div>

        </div>
      </div>

    </div>
  `,
  styleUrls: ['./map-view.component.css']
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
    
    private map: any;
    private userMarker: any;
    private searchMarker: any; 
    private geoHashBounds: any;
    private L: any; 
    private targetsSubscription: Subscription | null = null;
    private searchResultsSubscription: Subscription | null = null;

    isSheetExpanded: boolean = false; 
    isSearchActive: boolean = false; 
    currentSearchQuery: string = '';
    searchResults: SearchResult[] = [];
    selectedLocation: TargetLocation | null = null;
    nearestLocation: TargetLocation | null = null;

    targets: TargetLocation[] = []; 
    zones: MapZone[] = []; 
    
    manualLat: number | null = 13.7280;
    manualLng: number | null = 100.7765;

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        public mapService: MapService
    ) {
        this.zones = this.mapService.zones;
    }

    get displayList(): (SearchResult | TargetLocation)[] {
        return this.currentSearchQuery ? this.searchResults : this.targets;
    }

    activateSearch() {
        this.isSearchActive = true;
        this.clearSelection(); 
    }

    closeSearch() {
        this.isSearchActive = false;
        this.currentSearchQuery = '';
        this.mapService.pushSearchQuery('');
    }

    onSearchInput(query: string) {
        this.currentSearchQuery = query;
        this.mapService.pushSearchQuery(query);
    }

    clearSearch() {
        this.currentSearchQuery = '';
        this.mapService.pushSearchQuery('');
    }

    isTarget(item: any): item is TargetLocation {
        return (item as TargetLocation).color !== undefined;
    }

    handleItemSelect(item: any) {
        if (this.isTarget(item)) {
            this.onLocationSelect(item);
        } else {
            this.selectSearchResult(item);
        }
        this.isSearchActive = false; 
    }

    toggleSheet() {
        this.isSheetExpanded = !this.isSheetExpanded;
    }

    public clearSelection(): void {
        this.selectedLocation = null;
        this.isSheetExpanded = false; 
    }
    
    public getGoogleMapsLink(lat: number, lng: number): string {
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
    
    public async selectSearchResult(result: SearchResult): Promise<void> {
        const target: TargetLocation = {
            name: result.name,
            latlng: [result.lat, result.lng],
            id: result.id || 'search_temp_pin',
            description: result.address,
            color: '#FF0000',
            distance: undefined,
            mapMarker: undefined,
            rank: undefined
        };
        this.onLocationSelect(target); 

        if (!result.isLocal && this.L && this.map) {
            if (this.searchMarker) this.map.removeLayer(this.searchMarker);
            const icon = this.mapService.createPinIcon(this.L, target.color);
            this.searchMarker = this.L.marker(target.latlng, { icon: icon }).addTo(this.map).bindPopup(target.name).openPopup();
        }
    }

    public async focusOnSelectedZone(hash: string): Promise<void> {
        if (!hash || !this.map || !this.L || !this.mapService.isNgeohashInitialized()) return;
        const boundsArray = this.mapService.decodeGeoHashBounds(hash);
        if (!boundsArray) return;
        const bounds: any = [[boundsArray[0], boundsArray[1]], [boundsArray[2], boundsArray[3]]];
        this.map.fitBounds(bounds, { padding: [10, 10], duration: 1.2 });
    }
    
    public focusOnUser(): void {
        if (this.map && this.mapService.userLat !== null) {
            this.map.flyTo([this.mapService.userLat, this.mapService.userLng], 18);
            this.selectedLocation = null;
        }
    }

    public setMode(mode: PositionMode): void {
        if (this.mapService.positionMode === mode) return;
        this.mapService.positionMode = mode;
        if (mode === 'GPS') {
            if (this.L) this.mapService.startGeolocationTracking(this.L);
        } else {
            this.mapService.stopTracking(); 
            if (this.L) this.submitManualPosition(); 
        }
    }

    public submitManualPosition(): void {
        if (!this.L || !this.manualLat || !this.manualLng) return;
        this.mapService.setManualPosition(this.manualLat, this.manualLng, this.L);
        this.focusOnUser(); 
    }
    
    // --- Internal Helpers ---
    private initMap(L_local: any): boolean {
        this.L = L_local;
        const mapElement = document.getElementById('map');
        if (!mapElement) return false;
        
        this.map = L_local.map('map', { center: [13.727666, 100.77253], zoom: 15, zoomControl: false });
        L_local.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.map);
        
        this.map.on('zoomend', () => this.updateMarkerVisibility());

        this.targets = this.mapService.targetsSubject.getValue();
        this.initMarkers(L_local);
        setTimeout(() => { if (this.map) { this.map.invalidateSize(); } }, 500);
        return true; 
    }

    private initMarkers(L_local: any): void {
        this.targets = this.mapService.targetsSubject.getValue();
        this.targets.forEach((target, index) => {
            // FIX: Use (index + 1) if rank is not yet calculated
            const rank = target.rank || (index + 1);
            const targetIcon = this.mapService.createRankedPinIcon(L_local, target.color || '#007bff', rank); 
            
            const marker = L_local.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
            target.mapMarker = marker; // Store ref
            marker.on('click', () => this.onLocationSelect(target));
        });
        this.updateUserUI(L_local);
        this.updateMarkerVisibility();
    }

    private updateMarkerVisibility(): void {
        if (!this.map || !this.targets) return;
        const currentZoom = this.map.getZoom();
        const minZoom = 13; 

        this.targets.forEach(target => {
            if (target.mapMarker) {
                if (currentZoom < minZoom) {
                    this.map.removeLayer(target.mapMarker);
                } else {
                    if (!this.map.hasLayer(target.mapMarker)) {
                        this.map.addLayer(target.mapMarker);
                    }
                }
            }
        });
    }

    private clearAllMarkers(): void {
        if (!this.map) return;
        this.targets.forEach(t => { if(t.mapMarker) { this.map.removeLayer(t.mapMarker); t.mapMarker = undefined; } });
        if (this.userMarker) { this.map.removeLayer(this.userMarker); this.userMarker = undefined; }
        if (this.searchMarker) { this.map.removeLayer(this.searchMarker); this.searchMarker = undefined; }
    }

    private setupTargetsSubscription(L_local: any): void {
        this.targetsSubscription = this.mapService.targets$.subscribe(targets => {
            this.targets = targets;
            if (targets.length > 0) this.nearestLocation = targets[0]; 
            
            // Re-draw markers logic
            targets.forEach((target, index) => {
                if (target.mapMarker) {
                    // FIX: Ensure icon updates with rank, using index as fallback
                    const rank = target.rank || (index + 1);
                    const newIcon = this.mapService.createRankedPinIcon(L_local, target.color, rank);
                    target.mapMarker.setIcon(newIcon);
                }
            });
            this.updateUserUI(L_local);
        });
        this.searchResultsSubscription = this.mapService.searchResults$.subscribe(results => this.searchResults = results);
    }

    private updateUserUI(L_local: any): void {
        const userLat = this.mapService.userLat;
        const userLng = this.mapService.userLng;
        if (!userLat || !userLng || !this.map) return;

        if (!this.userMarker) { 
            const userIcon = this.mapService.createUserIcon(L_local);
            this.userMarker = L_local.marker([userLat, userLng], { icon: userIcon }).addTo(this.map);
        } else {
            this.userMarker.setLatLng([userLat, userLng]);
        }
        
        if (this.mapService.userGeoHash && this.mapService.isNgeohashInitialized()) {
             if (this.geoHashBounds) this.map.removeLayer(this.geoHashBounds); 
             const boundsArray = this.mapService.decodeGeoHashBounds(this.mapService.userGeoHash);
             const bounds: any = [[boundsArray[0], boundsArray[1]], [boundsArray[2], boundsArray[3]]];
             this.geoHashBounds = this.L.rectangle(bounds, { color: '#4285f4', weight: 2, fillOpacity: 0.15, fillColor: '#4285f4' }).addTo(this.map);
        }
    }

    ngOnInit(): void {}

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
        if (this.map) this.map.remove(); 
    }
}