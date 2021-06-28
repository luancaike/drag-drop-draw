import {DragDropDrawComponent} from '../drag-drop-draw.component';
import {runOutside} from '../util';
import {LegoConfig} from '../model';

export class Selectable {
    public selectionArea: LegoConfig;
    public selectedLegoKeys: string[];

    constructor(private drawComponent: DragDropDrawComponent) {
    }

    @runOutside
    selectArea(eventStart: MouseEvent): void {
        const {minBoundX, minBoundY} = this.drawComponent.getMaxAndMinBounds();
        const {dragEnd$, drag$} = this.drawComponent.getMouseEvents();
        let dragSub;
        let width = 0;
        let height = 0;
        const selectionArea: any = {};
        const startX = (eventStart.pageX - minBoundX) / this.drawComponent.scale;
        const startY = (eventStart.pageY - minBoundY) / this.drawComponent.scale;
        selectionArea.x = startX;
        selectionArea.y = startY;
        this.drawComponent.isSelecting = true;
        this.drawComponent.toggleSelectionGuidelines();
        dragSub = drag$.subscribe(eventDrag => {
            const mouseX = (eventDrag.pageX - minBoundX) / this.drawComponent.scale;
            const mouseY = (eventDrag.pageY - minBoundY) / this.drawComponent.scale;
            width = Math.abs(mouseX - startX);
            height = Math.abs(mouseY - startY);
            if (mouseX < startX) {
                selectionArea.x = mouseX;
            }
            if (mouseY < startY) {
                selectionArea.y = mouseY;
            }
            selectionArea.x = Math.round(selectionArea.x);
            selectionArea.y = Math.round(selectionArea.y);
            selectionArea.width = Math.round(width);
            selectionArea.height = Math.round(height);
            this.drawComponent.setDrawGuidelines(this.drawComponent.selectionPreview, selectionArea.x, selectionArea.y, selectionArea.width, selectionArea.height);
        });
        const dragEndSub = dragEnd$.subscribe(() => {
            this.selectionArea = selectionArea;
            this.selectionLegoByArea();
            if (dragSub) {
                dragSub.unsubscribe();
            }
            dragEndSub.unsubscribe();
            this.drawComponent.isSelecting = false;
        });
    }

    getSelectedLegos() {
        return this.selectedLegoKeys.reduce((acc, key) => {
            const result = this.drawComponent.allLegoConfig.find(el => el.key === key)
            if(result){
                acc.push(result)
            }
            return acc
        }, []);
    }

    selectionLegoByArea(): void {
        const minX = this.selectionArea.x;
        const minY = this.selectionArea.y;
        const maxX = this.selectionArea.x + this.selectionArea.width;
        const maxY = this.selectionArea.y + this.selectionArea.height;
        const selection = this.drawComponent.allLegoConfig
            .filter(lego => (lego.x >= minX) && ((lego.x + lego.width) <= maxX)
                && (lego.y >= minY) && ((lego.y + lego.height) <= maxY));
        this.resizeSelectionAreaBySelectedLego(selection);
        this.selectedLegoKeys = selection.map(({key}) => key);
        this.drawComponent.markSelectedLegos(selection.length !== 1);
    }

    resizeSelectionAreaBySelectedLego(selection: LegoConfig[]): void {
        const x = Math.min.apply(Math, selection.map(el => el.x)) - 1;
        const y = Math.min.apply(Math, selection.map(el => el.y)) - 1;
        const width = Math.max.apply(Math, selection.map(el => el.x + el.width)) - x + 1;
        const height = Math.max.apply(Math, selection.map(el => el.y + +el.height)) - y + 1;
        this.selectionArea = {
            x,
            y,
            width,
            height
        };
        if (selection.length > 1) {
            this.drawComponent.renderer.addClass(this.drawComponent.selectionPreview, 'select');
            this.drawComponent.setDrawGuidelines(this.drawComponent.selectionPreview, this.selectionArea.x, this.selectionArea.y, this.selectionArea.width, this.selectionArea.height);
        } else {
            this.drawComponent.toggleSelectionGuidelines(false);
        }

    }
}
