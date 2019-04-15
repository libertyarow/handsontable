import {
  getScrollbarWidth,
  getStyle,
  offset,
  outerHeight,
  outerWidth,
} from './../../../helpers/dom/element';
import { objectEach } from './../../../helpers/object';
import EventManager from './../../../eventManager';
import ViewportColumnsCalculator from './calculator/viewportColumns';
import ViewportRowsCalculator from './calculator/viewportRows';

/**
 * @class Viewport
 */
class Viewport {
  /**
   * @param wotInstance
   */
  constructor(wotInstance) {
    this.wot = wotInstance;
    // legacy support
    this.instance = this.wot;

    this.oversizedRows = [];
    this.oversizedColumnHeaders = [];
    this.hasOversizedColumnHeadersMarked = {};
    this.clientHeight = 0;
    this.containerWidth = NaN;
    this.rowHeaderWidth = NaN;
    this.rowsVisibleCalculator = null;
    this.columnsVisibleCalculator = null;

    this.eventManager = new EventManager(this.wot);
    this.eventManager.addEventListener(this.wot.rootWindow, 'resize', () => {
      this.clientHeight = this.getWorkspaceHeight();
    });
  }

  /**
   * @returns {number}
   */
  getWorkspaceHeight() {
    const currentDocument = this.wot.rootDocument;
    const trimmingContainer = this.instance.wtOverlays.topOverlay.trimmingContainer;
    let height = 0;

    if (trimmingContainer === this.wot.rootWindow) {
      height = currentDocument.documentElement.clientHeight;

    } else {
      let elemHeight = outerHeight(trimmingContainer);
      // returns height without DIV scrollbar
      height = (elemHeight > 0 && trimmingContainer.clientHeight > 0) ? trimmingContainer.clientHeight : Infinity;
    }

    return height;
  }

  getWorkspaceWidth() {
    const { wot } = this;
    const { rootDocument, rootWindow } = wot;
    const trimmingContainer = this.instance.wtOverlays.leftOverlay.trimmingContainer;
    const docOffsetWidth = rootDocument.documentElement.offsetWidth;
    const totalColumns = wot.getSetting('totalColumns');
    const preventOverflow = wot.getSetting('preventOverflow');
    let width;
    let overflow;

    if (preventOverflow) {
      return outerWidth(this.instance.wtTable.wtRootElement);
    }

    if (wot.getSetting('freezeOverlays')) {
      width = Math.min(docOffsetWidth - this.getWorkspaceOffset().left, docOffsetWidth);
    } else {
      width = Math.min(this.getContainerFillWidth(), docOffsetWidth - this.getWorkspaceOffset().left, docOffsetWidth);
    }

    if (trimmingContainer === rootWindow && totalColumns > 0 && this.sumColumnWidths(0, totalColumns - 1) > width) {
      // in case sum of column widths is higher than available stylesheet width, let's assume using the whole window
      // otherwise continue below, which will allow stretching
      // this is used in `scroll_window.html`
      // TODO test me
      return rootDocument.documentElement.clientWidth;
    }

    if (trimmingContainer !== rootWindow) {
      overflow = getStyle(this.instance.wtOverlays.leftOverlay.trimmingContainer, 'overflow', rootWindow);

      if (overflow === 'scroll' || overflow === 'hidden' || overflow === 'auto') {
        // this is used in `scroll.html`
        // TODO test me
        return Math.max(width, trimmingContainer.clientWidth);
      }
    }

    const stretchSetting = wot.getSetting('stretchH');

    if (stretchSetting === 'none' || !stretchSetting) {
      // if no stretching is used, return the maximum used workspace width
      return Math.max(width, outerWidth(this.instance.wtTable.TABLE));
    }

    // if stretching is used, return the actual container width, so the columns can fit inside it
    return width;
  }

  /**
   * Checks if viewport has vertical scroll
   *
   * @returns {Boolean}
   */
  hasVerticalScroll() {
    return this.getWorkspaceActualHeight() > this.getWorkspaceHeight();
  }

  /**
   * Checks if viewport has horizontal scroll
   *
   * @returns {Boolean}
   */
  hasHorizontalScroll() {
    return this.getWorkspaceActualWidth() > this.getWorkspaceWidth();
  }

  /**
   * @param from
   * @param length
   * @returns {Number}
   */
  sumColumnWidths(from, length) {
    const { wtTable } = this.wot;
    let sum = 0;
    let column = from;

    while (column < length) {
      sum += wtTable.getColumnWidth(column);
      column += 1;
    }

    return sum;
  }

  /**
   * @returns {Number}
   */
  getContainerFillWidth() {
    if (this.containerWidth) {
      return this.containerWidth;
    }

    const mainContainer = this.instance.wtTable.holder;
    const dummyElement = this.wot.rootDocument.createElement('div');

    dummyElement.style.width = '100%';
    dummyElement.style.height = '1px';
    mainContainer.appendChild(dummyElement);

    const fillWidth = dummyElement.offsetWidth;

    this.containerWidth = fillWidth;
    mainContainer.removeChild(dummyElement);

    return fillWidth;
  }

  /**
   * @returns {Number}
   */
  getWorkspaceOffset() {
    return offset(this.wot.wtTable.TABLE);
  }

  /**
   * @returns {Number}
   */
  getWorkspaceActualHeight() {
    return outerHeight(this.wot.wtTable.TABLE);
  }

  /**
   * @returns {Number}
   */
  getWorkspaceActualWidth() {
    const { wtTable } = this.wot;
    return outerWidth(wtTable.TABLE) ||
      outerWidth(wtTable.TBODY) ||
      outerWidth(wtTable.THEAD); // IE8 reports 0 as <table> offsetWidth;
  }

  /**
   * @returns {Number}
   */
  getColumnHeaderHeight() {
    const columnHeaders = this.instance.getSetting('columnHeaders');

    if (!columnHeaders.length) {
      this.columnHeaderHeight = 0;
    } else if (isNaN(this.columnHeaderHeight)) {
      this.columnHeaderHeight = outerHeight(this.wot.wtTable.THEAD);
    }

    return this.columnHeaderHeight;
  }

  /**
   * @returns {Number}
   */
  getViewportHeight() {
    let containerHeight = this.getWorkspaceHeight();

    if (containerHeight === Infinity) {
      return containerHeight;
    }

    const columnHeaderHeight = this.getColumnHeaderHeight();

    if (columnHeaderHeight > 0) {
      containerHeight -= columnHeaderHeight;
    }

    return containerHeight;
  }

  /**
   * @returns {Number}
   */
  getRowHeaderWidth() {
    const rowHeadersWidthSetting = this.instance.getSetting('rowHeaderWidth');
    const rowHeaders = this.instance.getSetting('rowHeaders');

    if (rowHeadersWidthSetting) {
      this.rowHeaderWidth = 0;

      for (let i = 0, len = rowHeaders.length; i < len; i++) {
        this.rowHeaderWidth += rowHeadersWidthSetting[i] || rowHeadersWidthSetting;
      }
    }

    if (this.wot.cloneSource) {
      return this.wot.cloneSource.wtViewport.getRowHeaderWidth();
    }

    if (isNaN(this.rowHeaderWidth)) {

      if (rowHeaders.length) {
        let TH = this.instance.wtTable.TABLE.querySelector('TH');
        this.rowHeaderWidth = 0;

        for (let i = 0, len = rowHeaders.length; i < len; i++) {
          if (TH) {
            this.rowHeaderWidth += outerWidth(TH);
            TH = TH.nextSibling;

          } else {
            // yes this is a cheat but it worked like that before, just taking assumption from CSS instead of measuring.
            // TODO: proper fix
            this.rowHeaderWidth += 50;
          }
        }
      } else {
        this.rowHeaderWidth = 0;
      }
    }

    this.rowHeaderWidth = this.instance.getSetting('onModifyRowHeaderWidth', this.rowHeaderWidth) || this.rowHeaderWidth;

    return this.rowHeaderWidth;
  }

  /**
   * @returns {Number}
   */
  getViewportWidth() {
    const containerWidth = this.getWorkspaceWidth();

    if (containerWidth === Infinity) {
      return containerWidth;
    }

    const rowHeaderWidth = this.getRowHeaderWidth();

    if (rowHeaderWidth > 0) {
      return containerWidth - rowHeaderWidth;
    }

    return containerWidth;
  }

  /**
   * Creates:
   *  - rowsRenderCalculator (before draw, to qualify rows for rendering)
   *  - rowsVisibleCalculator (after draw, to measure which rows are actually visible)
   *
   * @returns {ViewportRowsCalculator}
   */
  createRowsCalculator(visible = false) {
    const { wot } = this;
    const { wtSettings, wtOverlays, wtTable, rootDocument } = wot;
    let height;
    let scrollbarHeight;
    let fixedRowsHeight;

    this.rowHeaderWidth = NaN;

    if (wtSettings.settings.renderAllRows && !visible) {
      height = Infinity;
    } else {
      height = this.getViewportHeight();
    }

    let pos = wtOverlays.topOverlay.getScrollPosition() - wtOverlays.topOverlay.getTableParentOffset();

    if (pos < 0) {
      pos = 0;
    }

    const fixedRowsTop = wot.getSetting('fixedRowsTop');
    const fixedRowsBottom = wot.getSetting('fixedRowsBottom');
    const totalRows = wot.getSetting('totalRows');

    if (fixedRowsTop) {
      fixedRowsHeight = wtOverlays.topOverlay.sumCellSizes(0, fixedRowsTop);
      pos += fixedRowsHeight;
      height -= fixedRowsHeight;
    }

    if (fixedRowsBottom && wtOverlays.bottomOverlay.clone) {
      fixedRowsHeight = wtOverlays.bottomOverlay.sumCellSizes(totalRows - fixedRowsBottom, totalRows);

      height -= fixedRowsHeight;
    }

    if (wtTable.holder.clientHeight === wtTable.holder.offsetHeight) {
      scrollbarHeight = 0;
    } else {
      scrollbarHeight = getScrollbarWidth(rootDocument);
    }

    return new ViewportRowsCalculator(
      height,
      pos,
      wot.getSetting('totalRows'),
      sourceRow => wtTable.getRowHeight(sourceRow),
      visible ? null : wtSettings.settings.viewportRowCalculatorOverride,
      visible,
      scrollbarHeight
    );
  }

  /**
   * Creates:
   *  - columnsRenderCalculator (before draw, to qualify columns for rendering)
   *  - columnsVisibleCalculator (after draw, to measure which columns are actually visible)
   *
   * @returns {ViewportRowsCalculator}
   */
  createColumnsCalculator(visible = false) {
    const { wot } = this;
    const { wtSettings, wtOverlays, wtTable, rootDocument } = wot;
    let width = this.getViewportWidth();
    let pos = wtOverlays.leftOverlay.getScrollPosition() - wtOverlays.leftOverlay.getTableParentOffset();

    this.columnHeaderHeight = NaN;

    if (pos < 0) {
      pos = 0;
    }

    const fixedColumnsLeft = wot.getSetting('fixedColumnsLeft');

    if (fixedColumnsLeft) {
      const fixedColumnsWidth = wtOverlays.leftOverlay.sumCellSizes(0, fixedColumnsLeft);
      pos += fixedColumnsWidth;
      width -= fixedColumnsWidth;
    }
    if (wtTable.holder.clientWidth !== wtTable.holder.offsetWidth) {
      width -= getScrollbarWidth(rootDocument);
    }

    return new ViewportColumnsCalculator(
      width,
      pos,
      wot.getSetting('totalColumns'),
      sourceCol => wot.wtTable.getColumnWidth(sourceCol),
      visible ? null : wtSettings.settings.viewportColumnCalculatorOverride,
      visible,
      wot.getSetting('stretchH'),
      (stretchedWidth, column) => wot.getSetting('onBeforeStretchingColumnWidth', stretchedWidth, column)
    );
  }

  /**
   * Creates rowsRenderCalculator and columnsRenderCalculator (before draw, to determine what rows and
   * cols should be rendered)
   *
   * @param fastDraw {Boolean} If `true`, will try to avoid full redraw and only update the border positions.
   *                           If `false` or `undefined`, will perform a full redraw
   * @returns fastDraw {Boolean} The fastDraw value, possibly modified
   */
  createRenderCalculators(fastDraw = false) {
    let runFastDraw = fastDraw;

    if (runFastDraw) {
      const proposedRowsVisibleCalculator = this.createRowsCalculator(true);
      const proposedColumnsVisibleCalculator = this.createColumnsCalculator(true);

      if (!(this.areAllProposedVisibleRowsAlreadyRendered(proposedRowsVisibleCalculator) &&
          this.areAllProposedVisibleColumnsAlreadyRendered(proposedColumnsVisibleCalculator))) {
        runFastDraw = false;
      }
    }

    if (!runFastDraw) {
      this.rowsRenderCalculator = this.createRowsCalculator();
      this.columnsRenderCalculator = this.createColumnsCalculator();
    }
    // delete temporarily to make sure that renderers always use rowsRenderCalculator, not rowsVisibleCalculator
    this.rowsVisibleCalculator = null;
    this.columnsVisibleCalculator = null;

    return runFastDraw;
  }

  /**
   * Creates rowsVisibleCalculator and columnsVisibleCalculator (after draw, to determine what are
   * the actually visible rows and columns)
   */
  createVisibleCalculators() {
    this.rowsVisibleCalculator = this.createRowsCalculator(true);
    this.columnsVisibleCalculator = this.createColumnsCalculator(true);
  }

  /**
   * Creates rowsVisibleCalculator and columnsVisibleCalculator (after draw, to determine what are
   * the actually visible rows and columns)
   */
  // createFullyVisibleCalculators() {
  //   this.rowsVisibleCalculator = this.createRowsCalculator(true);
  //   this.columnsVisibleCalculator = this.createColumnsCalculator(true);
  // }

  /**
   * Returns information whether proposedRowsVisibleCalculator viewport
   * is contained inside rows rendered in previous draw (cached in rowsRenderCalculator)
   *
   * @param {Object} proposedRowsVisibleCalculator
   * @returns {Boolean} Returns `true` if all proposed visible rows are already rendered (meaning: redraw is not needed).
   *                    Returns `false` if at least one proposed visible row is not already rendered (meaning: redraw is needed)
   */
  areAllProposedVisibleRowsAlreadyRendered(proposedRowsVisibleCalculator) {
    if (this.rowsVisibleCalculator) {
      // if (proposedRowsVisibleCalculator.startRow < this.rowsRenderCalculator.startRow ||
          // (proposedRowsVisibleCalculator.startRow === this.rowsRenderCalculator.startRow &&
          // proposedRowsVisibleCalculator.startRow > 0)) {
      if (proposedRowsVisibleCalculator.startRow < this.rowsRenderCalculator.startRow) {
        return false;

      // } else if (proposedRowsVisibleCalculator.endRow > this.rowsRenderCalculator.endRow ||
          // (proposedRowsVisibleCalculator.endRow === this.rowsRenderCalculator.endRow &&
          // proposedRowsVisibleCalculator.endRow < this.wot.getSetting('totalRows') - 1)) {
      } else if (proposedRowsVisibleCalculator.endRow > this.rowsRenderCalculator.endRow) {
        return false;

      }
      return true;

    }

    return false;
  }

  /**
   * Returns information whether proposedColumnsVisibleCalculator viewport
   * is contained inside column rendered in previous draw (cached in columnsRenderCalculator)
   *
   * @param {Object} proposedColumnsVisibleCalculator
   * @returns {Boolean} Returns `true` if all proposed visible columns are already rendered (meaning: redraw is not needed).
   *                    Returns `false` if at least one proposed visible column is not already rendered (meaning: redraw is needed)
   */
  areAllProposedVisibleColumnsAlreadyRendered(proposedColumnsVisibleCalculator) {
    if (this.columnsVisibleCalculator) {
      // if (proposedColumnsVisibleCalculator.startColumn < this.columnsRenderCalculator.startColumn ||
          // (proposedColumnsVisibleCalculator.startColumn === this.columnsRenderCalculator.startColumn &&
          // proposedColumnsVisibleCalculator.startColumn > 0)) {
      if (proposedColumnsVisibleCalculator.startColumn < this.columnsRenderCalculator.startColumn) {
        return false;

      // } else if (proposedColumnsVisibleCalculator.endColumn > this.columnsRenderCalculator.endColumn ||
          // (proposedColumnsVisibleCalculator.endColumn === this.columnsRenderCalculator.endColumn &&
          // proposedColumnsVisibleCalculator.endColumn < this.wot.getSetting('totalColumns') - 1)) {
      } else if (proposedColumnsVisibleCalculator.endColumn > this.columnsRenderCalculator.endColumn) {
        return false;

      }
      return true;

    }

    return false;
  }

  /**
   * Resets values in keys of the hasOversizedColumnHeadersMarked object after updateSettings.
   */
  resetHasOversizedColumnHeadersMarked() {
    objectEach(this.hasOversizedColumnHeadersMarked, (value, key, object) => {
      object[key] = void 0;
    });
  }
}

export default Viewport;
