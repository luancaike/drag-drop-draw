import {DOCUMENT} from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChild,
    ElementRef,
    EventEmitter,
    Inject,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    QueryList,
    Renderer2,
    SimpleChanges,
    TemplateRef,
    ViewChild,
    ViewChildren,
    ViewEncapsulation
} from '@angular/core';
import {fromEvent, Subscription} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {v4 as uuid} from 'uuid';
import {debounce, runOutside} from './util';
import {Resizable} from './tools/resizable';
import {Draggable} from './tools/draggable';
import {Selectable} from './tools/selectable';
import {Renderable} from './tools/renderable';
import {Snappable} from './tools/snappable';
import {LegoConfig, LinesGuide} from './model';
import {LocalHistoryService} from './local-history.service';
import {Shortcuttable} from './tools/shortcuttable';

@Component({
    selector: 'ng-craftable',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './craftable.component.html',
    styleUrls: ['./craftable.component.scss']
})
export class CraftableComponent implements AfterViewInit, OnDestroy, OnChanges {
    @ContentChild('template', {read: TemplateRef}) template: TemplateRef<any>;
    @ViewChildren('lego') private legoList!: QueryList<ElementRef<HTMLElement>>;
    @ViewChild('canvasContainer') private canvasContainerRef: ElementRef<HTMLElement>;
    @ViewChild('mainArea') private mainAreaRef: ElementRef<HTMLElement>;
    @ViewChild('guideContainer') private guideContainerRef: ElementRef<HTMLElement>;

    @Input() public legoData: LegoConfig[] = [];
    @Input() public snapSize = 10;
    @Input() public gridSize = 10;
    @Input() public minWidth = 50;
    @Input() public minHeight = 50;
    @Input() public enableResize = true;
    @Input() public enableDrag = true;
    @Input() public drawItemData: { [k: string]: any };
    @Input() public enableStepGrid = false;
    @Input() public enableDraw = false;
    @Input() public visualizationMode = false;
    @Input() public scale = 1;

    @Output() public selectionChange = new EventEmitter<string[]>();
    @Output() public drawStart = new EventEmitter();
    @Output() public drawing = new EventEmitter();
    @Output() public drawEnd = new EventEmitter();

    public isSelecting = false;
    public isDragging = false;
    public isDrawing = false;
    public isResizing = false;

    public lineGuides: LinesGuide = {
        x: [],
        y: []
    };
    public fixedLineGuides: LinesGuide = {
        x: [
            {parent: 'fixed', position: 0},
            {parent: 'fixed', position: 600},
            {parent: 'fixed', position: 1200}
        ],
        y: [
            {parent: 'fixed', position: 0},
            {parent: 'fixed', position: 450},
            {parent: 'fixed', position: 900}
        ]
    };

    private resizeScreen$: Subscription;
    private keyDown$: Subscription;
    private keyUp$: Subscription;
    private resizeDebounce;
    private resizable: Resizable;
    private draggable: Draggable;
    private selectable: Selectable;
    private renderable: Renderable;
    private snappable: Snappable;
    private shortcuttable: Shortcuttable;

    constructor(
        public renderer: Renderer2,
        public localHistoryService: LocalHistoryService,
        @Inject(DOCUMENT) private document: Document,
        private cdr: ChangeDetectorRef
    ) {
        this.resizable = new Resizable(this);
        this.draggable = new Draggable(this);
        this.selectable = new Selectable(this);
        this.renderable = new Renderable(this);
        this.snappable = new Snappable(this);
        this.shortcuttable = new Shortcuttable(this);
    }

    get guideContainer(): HTMLElement {
        return this.guideContainerRef.nativeElement;
    }

    get canvasContainer(): HTMLElement {
        return this.canvasContainerRef.nativeElement;
    }

    get mainArea(): HTMLElement {
        return this.mainAreaRef.nativeElement;
    }

    get drawPreview(): HTMLElement {
        return this.document.querySelector<HTMLElement>('.draw-preview');
    }

    get selectionPreview(): HTMLElement {
        return this.document.querySelector<HTMLElement>('.selection-preview');
    }

    /**
     *  Public Api
     */
    selectAll(): void {
        if (this.checkInInteractionOrVisualizationMode()) {
            return;
        }
        this.selectAreaByLegos(this.legoData);
    }

    unSelectAll(): void {
        if (this.checkInInteractionOrVisualizationMode()) {
            return;
        }
        this.selectAreaByLegos([]);
    }


    undo() {
        this.setLegoData(this.localHistoryService.undoPoint());
        this.detectChanges();
    }

    redo() {
        this.setLegoData(this.localHistoryService.redoPoint());
        this.detectChanges();
    }

    copy() {
        this.localHistoryService.setTransferArea(this.selectable.getSelectedLegos());
        this.detectChanges();
    }

    cut() {
        this.localHistoryService.setTransferArea(this.selectable.getSelectedLegos());
        this.deleteSelection();
        this.detectChanges();
    }

    paste() {
        const legos = this.localHistoryService.getTransferArea().map(lego => this.appendLego({...lego, x: lego.x + 10, y: lego.y + 10}));
        this.saveLocalHistory();
        this.detectChanges();
        setTimeout(() => this.selectAreaByLegos(legos), 300);
    }

    duplicate() {
        this.copy();
        this.paste();
    }

    bringToForward() {
        const data = this.selectable.getSelectedLegos()
            .map((lego) => ({
                lego,
                layerIndex: Math.max(this.legoData.indexOf(lego) + 1, 0)
            }));
        this.changeLegoLayer(data);
        this.saveLocalHistory();
        this.detectChanges();
    }

    bringToBackward() {
        const data = this.selectable.getSelectedLegos()
            .map((lego) => ({
                lego,
                layerIndex: Math.max(this.legoData.indexOf(lego) - 1, 0)
            }));
        this.changeLegoLayer(data);
        this.saveLocalHistory();
        this.detectChanges();
    }

    bringToFront() {
        const data = this.selectable.getSelectedLegos()
            .map((lego) => ({
                lego,
                layerIndex: Math.max(this.legoData.length - 1, 0)
            }));
        this.changeLegoLayer(data);
        this.saveLocalHistory();
        this.detectChanges();
    }

    bringToBack() {
        const data = this.selectable.getSelectedLegos()
            .map((lego) => ({
                lego,
                layerIndex: Math.max(0, 0)
            }));
        this.changeLegoLayer(data);
        this.saveLocalHistory();
        this.detectChanges();
    }

    drawNewLego(dataToDraw = {}) {
        this.enableDraw = true;
        this.drawItemData = dataToDraw;
        this.detectChanges();
    }

    moveLego(keyboardKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
        const keysActions = {
            ArrowUp: (lego) => lego.y -= (this.gridSize + (lego.y % this.gridSize)),
            ArrowDown: (lego) => lego.x -= (this.gridSize + (lego.x % this.gridSize)),
            ArrowLeft: (lego) => lego.y -= (this.gridSize + (lego.y % this.gridSize)),
            ArrowRight: (lego) => lego.x += (this.gridSize - (lego.x % this.gridSize))
        };
        this.selectable.getSelectedLegos().forEach(lego => {
            keysActions[keyboardKey]?.(lego);
            this.updateLegoViewPositionAndSize(lego);
        });
        this.selectable.updateSelectionAreaBySelectedLego();
    }

    appendLego(newLego: LegoConfig) {
        newLego.key = uuid();
        this.legoData.push({...this.drawItemData, ...newLego});
        this.updateLegoViewData(newLego);
        this.detectChanges();
        return newLego;
    }

    checkInInteractionOrVisualizationMode() {
        return this.visualizationMode || this.isResizing || this.isDragging || this.isSelecting;
    }

    selectAreaByLegos(items: LegoConfig[]): void {
        if (this.checkInInteractionOrVisualizationMode()) {
            return;
        }
        const keys = items.map(({key}) => key);
        this.selectable.setSelectedLegoKeys(keys);
        this.updateSelectionArea();
        this.selectionChange.emit(keys);
    }

    deleteLego(key): void {
        this.legoData = this.legoData.filter(el => el.key !== key);
    }

    deleteSelection(): void {
        const selectedLegoKeys = this.selectable.getSelectedLegoKeys();
        selectedLegoKeys.forEach(key => {
            this.deleteLego(key);
            this.removeGuideLinesByLego({key});
        });
        this.clearSelection();
        this.saveLocalHistory();
        this.toggleSelectionGuidelines(false, false);
        this.detectChanges();
    }

    clearSelection(): void {
        this.selectionChange.emit([]);
        this.unSelectAllLegoInView();
        this.toggleSelectionGuidelines(false);
        this.selectable.setSelectedLegoKeys([]);
    }

    saveLocalHistory() {
        this.localHistoryService.addPoint(this.legoData);
    }

    setScaleByScreen(): void {
        this.scale = this.mainArea.offsetWidth < 1500 ? this.mainArea.offsetWidth / 1500 : 1;
        this.canvasContainer.style.transform = `scale(${this.scale})`;
        this.fixScaleSize();
    }

    resetGuideLines(): void {
        this.initFixedGuide();
        this.legoData.forEach(lego => {
            this.removeGuideLinesByLego(lego);
            this.calculateLineGuidesOfLego(lego);
        });
    }

    toggleDrawGuidelines(show = true): void {
        this.drawPreview.style.display = show ? 'block' : 'none';
        this.setDrawGuidelines(this.drawPreview, null, null, 0, 0);
    }

    getMaxAndMinBounds(): any {
        const maxBoundX = this.canvasContainer.offsetLeft + this.canvasContainer.offsetWidth;
        const maxBoundY = this.canvasContainer.offsetTop + this.canvasContainer.offsetHeight;
        const minBoundX = this.canvasContainer.offsetLeft;
        const minBoundY = this.canvasContainer.offsetTop;
        return {maxBoundX, maxBoundY, minBoundX, minBoundY};
    }

    getMouseEvents(): any {
        const dragEnd$ = fromEvent<MouseEvent>(this.document, 'mouseup');
        const drag$ = fromEvent<MouseEvent>(this.document, 'mousemove').pipe(takeUntil(dragEnd$));
        return {dragEnd$, drag$};
    }

    trackById(index, item): any {
        return item.key;
    }

    toggleSelectionGuidelines(show = true, selected = false): void {
        if (selected) {
            this.renderer.addClass(this.selectionPreview, 'select');
        } else {
            this.renderer.removeClass(this.selectionPreview, 'select');
        }
        this.selectionPreview.style.display = show ? 'block' : 'none';
        this.setDrawGuidelines(this.selectionPreview, null, null, 0, 0);
    }

    setDrawGuidelines(element: HTMLElement, x = null, y = null, width = null, height = null): void {
        if (x !== null) {
            this.renderer.setStyle(element, 'left', `${x}px`);
        }
        if (y !== null) {
            this.renderer.setStyle(element, 'top', `${y}px`);
        }
        if (width !== null) {
            this.renderer.setStyle(element, 'width', `${width}px`);
        }
        if (height !== null) {
            this.renderer.setStyle(element, 'height', `${height}px`);
        }
    }

    @runOutside
    mouseDownInMainArea($event: MouseEvent): void {
        if (this.visualizationMode || this.isDragging || this.isResizing) {
            return;
        }
        if (this.enableDraw) {
            this.drawHandler($event);
        } else {
            this.selectionHandler($event);
        }
        const selectionPreview = this.document.querySelector('.selection-preview');
        const isNotSelectionPreview = !(selectionPreview === $event.target || selectionPreview.contains($event.target as Node));
        const isNotLegoOrLegoChild = !this.legoList.find(
            lego => lego.nativeElement === $event.target || lego.nativeElement.contains($event.target as Node)
        );
        if (isNotLegoOrLegoChild && isNotSelectionPreview) {
            this.clearSelection();
        }
    }

    dragHandler(eventStart: MouseEvent, legoConfig: LegoConfig, isSelection = false): void {
        if (!this.validInitDrag(legoConfig, isSelection)) {
            return;
        }
        const selectedLego = this.selectable.getSelectedLegos();
        this.draggable.moveItem(eventStart, this.selectable.selectionArea, selectedLego);
    }

    drawHandler(eventStart: MouseEvent): void {
        this.renderable.draw(eventStart);
    }

    selectionHandler(eventStart: MouseEvent): void {
        this.selectable.selectArea(eventStart);
    }

    resizeHandler(eventStart: MouseEvent, direction: string): void {
        if (!this.enableResize) {
            return;
        }
        const selectedLegoKeys = this.selectable.getSelectedLegoKeys();
        const selectedLego = selectedLegoKeys.map(key => this.legoData.find(el => el.key === key));
        this.resizable.resizeItemGroup(eventStart, direction, this.selectable.selectionArea, selectedLego);
    }

    snapToGuideLine(lego: LegoConfig, isResize = false, ignoreAxisKey: string[] = [], directionHandler: 'start' | 'end' | 'none' = 'none'): void {
        this.hiddenGuideLines();
        const params = {
            lineGuides: this.lineGuides,
            snapSize: this.snapSize,
            callBackOnThrust: (axis, position, parent) => this.showGuideLines(axis, position, parent),
            lego,
            ignoreAxisKey,
            isResize
        };
        this.snappable.checkLegoInSnap({...params, axis: 'x', directionHandler});
        this.snappable.checkLegoInSnap({...params, axis: 'y', directionHandler});
    }

    hiddenGuideLines(): void {
        const data = this.document.querySelectorAll<HTMLDivElement>('[class*="line-guide-"]');
        const legos = this.document.querySelectorAll<HTMLDivElement>('.highlight-guide');
        data.forEach(el => {
            el.remove();
        });
        legos.forEach(el => {
            el.classList.remove('highlight-guide');
        });
    }

    updateSelectionArea(): void {
        this.markSelectedLegos();
        this.toggleSelectionGuidelines();
        this.selectable.selectionAreaOfSelectedLegos();
    }

    showGuideLines(axis: 'x' | 'y', position: number, parent: string): void {
        const className = 'line-guide-' + axis;
        const positionScale = Math.floor(position * this.scale);
        const lineGuideId = `line-guide-${axis}-${positionScale}`;
        const existsGuideThisValue = this.document.querySelector(`[id="${lineGuideId}"]`);
        if (!!existsGuideThisValue) {
            return;
        }
        const element = this.document.createElement('div');
        element.id = lineGuideId;
        element.classList.add(className);
        const fixAxisXWidth = Math.max(positionScale - (axis === 'x' ? 1 : 1), 0);
        element.style[axis === 'x' ? 'left' : 'top'] = `${fixAxisXWidth}px`;
        this.highlightParent(parent);
        this.guideContainer.appendChild(element);
    }

    highlightParent(key: string) {
        const lego = this.document.querySelector<HTMLDivElement>(`[data-key="${key}"]`);
        if (lego) {
            lego.classList.add('highlight-guide');
        }
    }

    removeGuideLinesByLego(item): void {
        this.lineGuides.x = this.lineGuides.x.filter(el => el.parent !== item.key);
        this.lineGuides.y = this.lineGuides.y.filter(el => el.parent !== item.key);
    }

    updateLegoData(item) {
        if (item.key) {
            this.legoData = this.legoData.map(el => ({
                ...el,
                ...(el.key === item.key ? item : {})
            }));
            this.detectChanges();
        }
    }

    setLegoData(data: LegoConfig[]) {
        this.legoData = data;
        this.legoData.forEach(el => this.updateLegoViewData(el));
        this.resetGuideLines();
        this.selectable.updateSelectionAreaBySelectedLego();
    }

    updateLegoViewData(item: LegoConfig) {
        this.updateLegoViewPositionAndSize(item);
        this.resetGuideLines();
    }

    updateLegoViewPositionAndSize(item: LegoConfig): void {
        const lego = this.document.querySelector<HTMLDivElement>(`[data-key="${item.key}"]`);
        if (lego) {
            this.renderer.setStyle(lego, 'display', `block`);
            this.renderer.setStyle(lego, 'width', `${item.width}px`);
            this.renderer.setStyle(lego, 'height', `${item.height}px`);
            this.renderer.setStyle(lego, 'left', `${item.x}px`);
            this.renderer.setStyle(lego, 'top', `${item.y}px`);
        } else {
            setTimeout(() => this.updateLegoViewPositionAndSize(item), 300);
        }
    }

    markSelectedLegos() {
        const selectedLegoKeys = this.selectable.getSelectedLegoKeys();
        const inGroupLego = selectedLegoKeys.length > 1;
        this.document.querySelectorAll('.lego-item.select').forEach(lego => this.renderer.removeClass(lego, 'select'));
        selectedLegoKeys
            .map(key => this.document.querySelector<HTMLDivElement>(`[data-key="${key}"]`))
            .forEach(lego =>
                inGroupLego ? this.renderer.addClass(lego, 'in-group') :
                    this.renderer.addClass(lego, 'select')
            );

    }

    fixByGridSize(value: number) {
        if (this.enableStepGrid) {
            return Math.round(value - value % this.gridSize);
        }
        return value;
    }

    /**
     *  Private Methods
     */
    private changeLegoLayer(data: { lego: any, layerIndex: number }[]) {
        this.legoData = this.legoData.filter(lg => !data.find(({lego}) => lego === lg));
        data.forEach(({lego, layerIndex}) => {
            this.legoData.splice(layerIndex, 0, lego);
        });
    }

    private registerShortcuts() {
        this.shortcuttable.registerShortcuts();
    }

    private fixScaleSize(): void {
        this.changeSizeElement('.guide-container');
        this.changeSizeElement('.scale-wrapper');
    }

    private changeSizeElement(selectors: string): void {
        const width = this.canvasContainer.offsetWidth;
        const height = this.canvasContainer.offsetHeight;
        this.document.querySelector<HTMLDivElement>(selectors).style.width = `${width * this.scale}px`;
        this.document.querySelector<HTMLDivElement>(selectors).style.height = `${height * this.scale}px`;
    }

    private initFixedGuide(): void {
        const width = this.canvasContainer.offsetWidth;
        const height = this.canvasContainer.offsetHeight;
        this.lineGuides.x = [0, width / 2, width].map(position => ({parent: 'fixed', position}));
        this.lineGuides.y = [0, height / 2, height].map(position => ({parent: 'fixed', position}));
    }

    private validInitDrag(legoConfig: LegoConfig, isSelection: boolean): boolean {
        if (this.enableDrag) {
            const selectedLegoKeys = this.selectable.getSelectedLegoKeys();
            if (!isSelection && selectedLegoKeys.length <= 1) {
                this.selectAreaByLegos([legoConfig]);
            }
            return selectedLegoKeys.includes(legoConfig.key) || isSelection;
        }
        return false;

    }

    private calculateLineGuidesOfLego(item: LegoConfig): void {
        if (!item.key) {
            return;
        }
        this.removeGuideLinesByLego(item);
        this.lineGuides.x = [
            ...this.lineGuides.x,
            ...[
                {parent: item.key, position: item.x},
                {parent: item.key, position: item.x + Math.round(item.width / 2)},
                {parent: item.key, position: item.x + item.width}
            ]
        ];
        this.lineGuides.y = [
            ...this.lineGuides.y,
            ...[
                {parent: item.key, position: item.y},
                {parent: item.key, position: item.y + Math.round(item.height / 2)},
                {parent: item.key, position: item.y + item.height}
            ]
        ];
        this.detectChanges();
    }

    private unSelectAllLegoInView() {
        this.document.querySelectorAll('.lego-item')
            .forEach(lego => {
                this.renderer.removeClass(lego, 'select');
                this.renderer.removeClass(lego, 'in-group');
            });

    }

    @debounce(100)
    private detectChanges() {
        this.cdr.detectChanges();
    }

    /**
     *  Angular Methods
     */
    ngAfterViewInit(): void {
        this.initFixedGuide();
        this.setScaleByScreen();
        this.resizeScreen$ = fromEvent<MouseEvent>(window, 'resize').subscribe(() => {
            clearTimeout(this.resizeDebounce);
            this.resizeDebounce = setTimeout(() => {
                this.setScaleByScreen();
            }, 100);
        });
        this.keyDown$ = fromEvent<KeyboardEvent>(this.document, 'keydown').subscribe(event => {
            this.shortcuttable.onKeyDown(event);
        });
        this.keyUp$ = fromEvent<KeyboardEvent>(this.document, 'keyup').subscribe(event => {
            this.shortcuttable.onKeyUp(event);
        });
        this.registerShortcuts();
        this.legoData.forEach(lego => this.updateLegoViewData(lego));
    }

    ngOnDestroy(): void {
        this.resizeScreen$.unsubscribe();
        this.keyDown$.unsubscribe();
        this.keyUp$.unsubscribe();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.allLegoConfig) {
            this.legoData.forEach(lego => this.updateLegoViewData(lego));
        }
    }
}
