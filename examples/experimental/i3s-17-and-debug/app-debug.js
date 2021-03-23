/* global fetch */
import React, {PureComponent} from 'react';
import {render} from 'react-dom';
import {StaticMap} from 'react-map-gl';

import {lumaStats} from '@luma.gl/core';
import DeckGL from '@deck.gl/react';
import {FlyToInterpolator, View, MapView, WebMercatorViewport} from '@deck.gl/core';
import {LineLayer} from '@deck.gl/layers';

import {I3SLoader} from '@loaders.gl/i3s';
import {StatsWidget} from '@probe.gl/stats-widget';

import {INITIAL_EXAMPLE_NAME, EXAMPLES} from './examples';
import DebugPanel from './components/debug-panel';
import ControlPanel from './components/control-panel';

import {INITIAL_MAP_STYLE, CONTRAST_MAP_STYLES, INITIAL_COLORING_MODE} from './constants';
import {getFrustumBounds} from './frustum-utils';
import TileLayer from './tile-layer/tile-layer';
import AttributesTooltip from './components/attributes-tooltip';
import {getTileDebugInfo} from './tile-debug';
import {parseTilesetUrlFromUrl, parseTilesetUrlParams} from './url-utils';

const TRANSITION_DURAITON = 4000;

const INITIAL_VIEW_STATE = {
  longitude: -120,
  latitude: 34,
  height: 600,
  width: 800,
  pitch: 45,
  maxPitch: 60,
  bearing: 0,
  minZoom: 2,
  maxZoom: 30,
  zoom: 14.5
};
const STATS_WIDGET_STYLE = {
  wordBreak: 'break-word',
  padding: 12,
  zIndex: '10000',
  maxWidth: 300,
  background: '#000',
  color: '#fff',
  alignSelf: 'flex-start'
};

const VIEWS = [
  new MapView({
    id: 'main',
    controller: true
  }),
  new MapView({
    id: 'minimap',

    // Position on top of main map
    x: '80%',
    y: '80%',
    width: '20%',
    height: '20%',

    // Minimap is overlaid on top of an existing view, so need to clear the background
    clear: true,

    controller: {
      maxZoom: 9,
      minZoom: 9,
      dragRotate: false,
      keyboard: false
    }
  })
];

export default class App extends PureComponent {
  constructor(props) {
    super(props);
    this._tilesetStatsWidget = null;
    this.state = {
      url: null,
      token: null,
      name: INITIAL_EXAMPLE_NAME,
      viewState: {
        main: INITIAL_VIEW_STATE,
        minimap: {
          latitude: INITIAL_VIEW_STATE.latitude,
          longitude: INITIAL_VIEW_STATE.longitude,
          zoom: 9,
          pitch: 0,
          bearing: 0
        }
      },
      selectedColoringMode: INITIAL_COLORING_MODE,
      selectedMapStyle: INITIAL_MAP_STYLE,
      debugOptions: {
        minimap: true
      }
    };
    this._onSelectTileset = this._onSelectTileset.bind(this);
    this._setDebugOptions = this._setDebugOptions.bind(this);
  }

  componentDidMount() {
    this._memWidget = new StatsWidget(lumaStats.get('Memory Usage'), {
      framesPerUpdate: 1,
      formatters: {
        'GPU Memory': 'memory',
        'Buffer Memory': 'memory',
        'Renderbuffer Memory': 'memory',
        'Texture Memory': 'memory'
      },
      container: this._statsWidgetContainer
    });
    this._tilesetStatsWidget = new StatsWidget(null, {
      container: this._statsWidgetContainer
    });

    // Check if a tileset is specified in the query params
    let tileset;
    const tilesetUrl = parseTilesetUrlFromUrl();
    if (tilesetUrl) {
      tileset = {url: tilesetUrl};
    } else {
      tileset = EXAMPLES[INITIAL_EXAMPLE_NAME];
    }
    this._onSelectTileset(tileset);
  }

  _getViewState() {
    const {viewState, debugOptions} = this.state;
    return debugOptions.minimap ? viewState : {main: viewState.main};
  }

  _getViews() {
    const {debugOptions} = this.state;
    return debugOptions.minimap ? VIEWS : [VIEWS[0]];
  }

  async _onSelectTileset(tileset) {
    const params = parseTilesetUrlParams(tileset.url, tileset);
    const {tilesetUrl, token, name, metadataUrl} = params;
    this.setState({tilesetUrl, name, token});
    const metadata = await fetch(metadataUrl).then(resp => resp.json());
    this.setState({metadata});
  }

  // Updates stats, called every frame
  _updateStatWidgets() {
    this._memWidget.update();
    this._tilesetStatsWidget.update();
  }

  _onTilesetLoad(tileset) {
    const {zoom, cartographicCenter} = tileset;
    const [longitude, latitude] = cartographicCenter;

    this.setState({
      tileset,
      viewState: {
        main: {
          ...this.state.viewState.main,
          zoom: zoom + 2.5,
          longitude,
          latitude,
          transitionDuration: TRANSITION_DURAITON,
          transitionInterpolator: new FlyToInterpolator()
        },
        minimap: {
          ...this.state.viewState.minimap,
          longitude,
          latitude
        }
      }
    });

    this._tilesetStatsWidget.setStats(tileset.stats);
  }

  _onViewStateChange({viewState, viewId}) {
    const oldViewState = this.state.viewState;
    if (viewId === 'minimap') {
      this.setState({
        viewState: {
          main: {
            ...oldViewState.main,
            longitude: viewState.longitude,
            latitude: viewState.latitude
          },
          minimap: viewState
        }
      });
    } else {
      this.setState({
        viewState: {
          main: viewState,
          minimap: {
            ...oldViewState.minimap,
            longitude: viewState.longitude,
            latitude: viewState.latitude
          }
        }
      });
    }
  }

  _onSelectMapStyle({selectedMapStyle}) {
    this.setState({selectedMapStyle});
  }

  _setDebugOptions(debugOptions) {
    this.setState({debugOptions});
  }

  _onSelectColoringMode({selectedColoringMode}) {
    this.setState({selectedColoringMode});
  }

  _renderLayers() {
    const {tilesetUrl, token, viewState, selectedColoringMode} = this.state;
    const loadOptions = {throttleRequests: true};

    if (token) {
      loadOptions.token = token;
    }

    const viewport = new WebMercatorViewport(viewState.main);
    const frustumBounds = getFrustumBounds(viewport);

    return [
      new TileLayer({
        data: tilesetUrl,
        loader: I3SLoader,
        onTilesetLoad: this._onTilesetLoad.bind(this),
        onTileLoad: () => this._updateStatWidgets(),
        onTileUnload: () => this._updateStatWidgets(),
        coloredBy: selectedColoringMode,
        loadOptions,
        pickable: true,
        autoHighlight: true,
        isDebugMode: true
      }),
      new LineLayer({
        id: 'frustum',
        data: frustumBounds,
        getSourcePosition: d => d.source,
        getTargetPosition: d => d.target,
        getColor: d => d.color,
        getWidth: 2
      })
    ];
  }

  _renderDebugPanel() {
    return <DebugPanel onOptionsChange={this._setDebugOptions}>{this._renderStats()}</DebugPanel>;
  }

  _renderStats() {
    // TODO - too verbose, get more default styling from stats widget?
    return <div style={STATS_WIDGET_STYLE} ref={_ => (this._statsWidgetContainer = _)} />;
  }

  _renderControlPanel() {
    const {name, tileset, token, metadata, selectedMapStyle, selectedColoringMode} = this.state;
    return (
      <ControlPanel
        tileset={tileset}
        name={name}
        metadata={metadata}
        token={token}
        onExampleChange={this._onSelectTileset}
        onMapStyleChange={this._onSelectMapStyle.bind(this)}
        onColoringModeChange={this._onSelectColoringMode.bind(this)}
        selectedMapStyle={selectedMapStyle}
        selectedColoringMode={selectedColoringMode}
      />
    );
  }

  _layerFilter({layer, viewport}) {
    if (viewport.id !== 'minimap' && layer.id === 'frustum') {
      // only display frustum in the minimap
      return false;
    }
    return true;
  }

  getTooltip(info) {
    if (!info.object || info.index < 0 || !info.layer) {
      return null;
    }
    const tileInfo = getTileDebugInfo(info.object);
    // eslint-disable-next-line no-undef
    const tooltip = document.createElement('div');
    render(<AttributesTooltip data={tileInfo} />, tooltip);

    return {html: tooltip.innerHTML};
  }

  render() {
    const layers = this._renderLayers();
    const {selectedMapStyle} = this.state;

    return (
      <div style={{position: 'relative', height: '100%'}}>
        {this._renderDebugPanel()}
        {this._renderControlPanel()}
        <DeckGL
          layers={layers}
          viewState={this._getViewState()}
          views={this._getViews()}
          layerFilter={this._layerFilter}
          onViewStateChange={this._onViewStateChange.bind(this)}
          onAfterRender={() => this._updateStatWidgets()}
          getTooltip={info => this.getTooltip(info)}
        >
          {/* <StaticMap mapStyle={selectedMapStyle} preventStyleDiffing /> */}
          <StaticMap reuseMaps mapStyle={selectedMapStyle} preventStyleDiffing={true} />
          <View id="minimap">
            <StaticMap
              reuseMaps
              mapStyle={CONTRAST_MAP_STYLES[selectedMapStyle]}
              preventStyleDiffing={true}
            />
          </View>
        </DeckGL>
      </div>
    );
  }
}

export function renderToDOM(container) {
  render(<App />, container);
}