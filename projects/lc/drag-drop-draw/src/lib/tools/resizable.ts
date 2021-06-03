import {runOutside} from '../util';
import {DragDropDrawComponent} from '../drag-drop-draw.component';
import { LegoConfig } from '../model';

export class Resizable {

    constructor(private drawComponent: DragDropDrawComponent) {
    }
    @runOutside
    private resize(eventStart: MouseEvent, direction: string, itemResizing, selectionGroup: LegoConfig[] = []): void {
        this.drawComponent.isResizing = true;
        const {minBoundX, minBoundY} = this.drawComponent.getMaxAndMinBounds();
        let dragEndSub;

        const initialX = eventStart.pageX / this.drawComponent.scale - minBoundX;
        const initialY = eventStart.pageY / this.drawComponent.scale - minBoundY;
        const offsetY = itemResizing.y;
        const offsetX = itemResizing.x;
        const height = itemResizing.height;
        const width = itemResizing.width;
        const {dragEnd$, drag$} = this.drawComponent.getMouseEvents();
        this.drawComponent.removeGuideLinesByLego(itemResizing);

        const legoGroupDiffScale = selectionGroup.map((lego) => ({
            ...lego,
            width: lego.width / itemResizing.width,
            height: lego.height / itemResizing.height,
            x: (lego.x - itemResizing.x) / itemResizing.width,
            y: (lego.y - itemResizing.y) / itemResizing.height,
        }));

        const dragSub = drag$.subscribe(eventDrag => {
            const resizeByNegativeAxis = axis => {
                const pageAxis = axis === 'x' ? eventDrag.pageX : eventDrag.pageY;
                const initial = axis === 'x' ? initialX : initialY;
                const minBound = axis === 'x' ? minBoundX : minBoundY;
                const minSize = axis === 'x' ? this.drawComponent.minWidth : this.drawComponent.minHeight;
                const offset = axis === 'x' ? offsetX : offsetY;
                const size = axis === 'x' ? width : height;
                let reduce = (pageAxis / this.drawComponent.scale - initial) - minBound;
                let newAxis = Math.round(offset + this.drawComponent.fixByGridSize(reduce));
                let newSize = Math.round(size - this.drawComponent.fixByGridSize(reduce));
                const reduceSize = size - reduce;
                if (reduceSize >= minSize) {
                    itemResizing[axis] = this.drawComponent.fixByGridSize(newAxis);
                }
                if (itemResizing[axis]) {
                    itemResizing[axis === 'x' ? 'width' : 'height'] = this.drawComponent.fixByGridSize(newSize);
                }
            };
            const resizeByPositiveAxis = axis => {
                const pageAxis = axis === 'x' ? eventDrag.pageX : eventDrag.pageY;
                const initial = axis === 'x' ? initialX : initialY;
                const minBound = axis === 'x' ? minBoundX : minBoundY;
                const size = axis === 'x' ? width : height;
                const reduce = pageAxis / this.drawComponent.scale - minBound;
                itemResizing[axis === 'x' ? 'width' : 'height'] = this.drawComponent.fixByGridSize(size + reduce - initial);
            };
            if (direction.indexOf('right') >= 0) {
                resizeByPositiveAxis('x');
            }
            if (direction.indexOf('left') >= 0) {
                resizeByNegativeAxis('x');
            }

            if (direction.indexOf('top') >= 0) {
                resizeByNegativeAxis('y');
            }
            if (direction.indexOf('bottom') >= 0) {
                resizeByPositiveAxis('y');
            }
            itemResizing.width = Math.round(Math.max(this.drawComponent.minWidth, itemResizing.width));
            itemResizing.height = Math.round(Math.max(this.drawComponent.minHeight, itemResizing.height));
            this.drawComponent.snapToGuideLine(itemResizing, true, selectionGroup.map(({key}) => key));
            this.drawComponent.updateLegoViewPositionAndSize(itemResizing);
            this.drawComponent.changeDrawGuidelines(this.drawComponent.selectionPreview, itemResizing.x, itemResizing.y, itemResizing.width, itemResizing.height);
            const newLegoGroupPosition = legoGroupDiffScale.map((oldLego) => ({
                ...oldLego,
                x: (itemResizing.width * oldLego.x) + itemResizing.x,
                y: (itemResizing.height * oldLego.y) + itemResizing.y,
                width: itemResizing.width * oldLego.width,
                height: itemResizing.height * oldLego.height
            }));
            newLegoGroupPosition.forEach((lego) => this.drawComponent.updateLegoViewPositionAndSize(lego));
            if (dragEndSub) {
                dragEndSub.unsubscribe();
            }
            dragEndSub = dragEnd$.subscribe(() => {
                newLegoGroupPosition.forEach(lego => {
                    this.drawComponent.updateLegoData(lego);
                    this.drawComponent.updateLegoViewData(lego);
                });
                this.drawComponent.updateLegoData(itemResizing);
                this.drawComponent.updateLegoViewData(itemResizing);
                this.drawComponent.hiddenAllHighlightLines();
                dragSub.unsubscribe();
                dragEndSub.unsubscribe();
                this.drawComponent.isResizing = false;
            });
        });
    }

    @runOutside
    resizeItem(eventStart: MouseEvent, direction: string, itemResizing): void {
        this.resize(eventStart, direction, itemResizing)
    }
    @runOutside
    resizeItemGroup(eventStart: MouseEvent, direction: string, itemResizing, selectionGroup: LegoConfig[]): void {
        this.resize(eventStart, direction, itemResizing, selectionGroup)
    }
}
