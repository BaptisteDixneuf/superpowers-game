import ui, { setupLayer, selectBrushTool, refreshLayersId } from "./ui";
import mapArea from "./mapArea";
import tileSetArea from "./tileSetArea";

import { TileMapLayerPub } from "../../data/TileMapLayers";
import TileMapRenderer from "../../components/TileMapRenderer";
import TileMapRendererUpdater from "../../components/TileMapRendererUpdater";

import TileSet from "../../components/TileSet";
import TileSetRenderer from "../../components/TileSetRenderer";
import TileSetRendererUpdater from "../../components/TileSetRendererUpdater";

export let data: { projectClient?: SupClient.ProjectClient; tileMapUpdater?: TileMapRendererUpdater, tileSetUpdater?: TileSetRendererUpdater } = {};

let socket: SocketIOClient.Socket;
SupClient.i18n.load([{ root: `${window.location.pathname}/../..`, name: "tileMapEditor" }], () => {
  socket = SupClient.connect(SupClient.query.project);
  socket.on("connect", onConnected);
  socket.on("disconnect", SupClient.onDisconnected);
});

let onEditCommands: any = {};
let onTileSetEditCommands: any = {};

function onConnected() {
  data.projectClient = new SupClient.ProjectClient(socket, { subEntries: true });

  let tileMapActor = new SupEngine.Actor(mapArea.gameInstance, "Tile Map");
  let tileMapRenderer = new TileMapRenderer(tileMapActor);
  let config = { tileMapAssetId: SupClient.query.asset, tileSetAssetId: <string>null, materialType: "basic" };
  let receiveCallbacks = { tileMap: onTileMapAssetReceived };
  let editCallbacks = { tileMap: onEditCommands };
  data.tileMapUpdater = new TileMapRenderer.Updater(data.projectClient, tileMapRenderer, config, receiveCallbacks, editCallbacks);
}

// Tile Map
function onTileMapAssetReceived() {
  let pub = data.tileMapUpdater.tileMapAsset.pub;

  let tileSetActor = new SupEngine.Actor(tileSetArea.gameInstance, "Tile Set");
  let tileSetRenderer = new TileSetRenderer(tileSetActor);
  let config = { tileSetAssetId: pub.tileSetId };

  let receiveCallbacks = { tileSet: onTileSetAssetReceived };
  let editCallbacks = { tileSet: onTileSetEditCommands };
  data.tileSetUpdater = new TileSetRenderer.Updater(data.projectClient, tileSetRenderer, config, receiveCallbacks, editCallbacks);

  updateTileSetInput();
  onEditCommands.resizeMap();

  for (let setting in ui.settings) onEditCommands.setProperty(setting, (<any>pub)[setting]);
  for (let index = pub.layers.length - 1; index >= 0; index--) setupLayer(pub.layers[index], index);

  tileSetArea.selectedLayerId = pub.layers[0].id.toString();
  ui.layersTreeView.addToSelection(ui.layersTreeView.treeRoot.querySelector(`li[data-id="${pub.layers[0].id}"]`));
  mapArea.patternActor.setLocalPosition(new SupEngine.THREE.Vector3(0, 0, pub.layerDepthOffset / 2));
}

export function editAsset(...args: any[]) {
  let callback: Function;
  if (typeof args[args.length - 1] === "function") callback = args.pop();

  args.push((err: string, id: string) => {
    if (err != null) { new SupClient.dialogs.InfoDialog(err, SupClient.i18n.t("common:actions.close")); return; }
    if (callback != null) callback(id);
  });
  socket.emit("edit:assets", SupClient.query.asset, ...args);
}

function updateTileSetInput() {
  let tileSetName =
    (data.tileMapUpdater.tileMapAsset.pub.tileSetId != null) ?
      data.projectClient.entries.getPathFromId(data.tileMapUpdater.tileMapAsset.pub.tileSetId) : "";
  ui.tileSetInput.value = tileSetName;
  ui.openTileSetButton.disabled = data.tileMapUpdater.tileMapAsset.pub.tileSetId == null;
}

onEditCommands.changeTileSet = () => {
  updateTileSetInput();
  data.tileSetUpdater.changeTileSetId(data.tileMapUpdater.tileMapAsset.pub.tileSetId);
};

onEditCommands.resizeMap = () => {
  let width = data.tileMapUpdater.tileMapAsset.pub.width;
  let height = data.tileMapUpdater.tileMapAsset.pub.height;
  ui.sizeInput.value = `${width} × ${height}`;
  mapArea.gridRenderer.resize(width, height);
};

onEditCommands.setProperty = (path: string, value: any) => {
  ui.settings[path].value = value;

  if (path === "pixelsPerUnit" && data.tileMapUpdater.tileSetAsset != null) {
    let tileSetPub = data.tileMapUpdater.tileSetAsset.pub;
    let tileMapPub = data.tileMapUpdater.tileMapAsset.pub;
    mapArea.cameraControls.setMultiplier(value / tileSetPub.grid.width / 1);

    mapArea.gridRenderer.setRatio({ x: tileMapPub.pixelsPerUnit / tileSetPub.grid.width, y: tileMapPub.pixelsPerUnit / tileSetPub.grid.height });
    mapArea.patternRenderer.refreshPixelsPerUnit(tileMapPub.pixelsPerUnit);
    mapArea.patternBackgroundRenderer.refreshScale(1 / tileMapPub.pixelsPerUnit);
  }
};

onEditCommands.newLayer = (layerPub: TileMapLayerPub, index: number) => {
  setupLayer(layerPub, index);

  let pub = data.tileMapUpdater.tileMapAsset.pub;
  let layer = data.tileMapUpdater.tileMapAsset.layers.byId[tileSetArea.selectedLayerId];
  let z = (pub.layers.indexOf(layer) + 0.5) * pub.layerDepthOffset;
  mapArea.patternActor.setLocalPosition(new SupEngine.THREE.Vector3(0, 0, z));

  refreshLayersId();
};

onEditCommands.renameLayer = (id: string, newName: string) => {
  let layerElt = ui.layersTreeView.treeRoot.querySelector(`[data-id="${id}"]`);
  layerElt.querySelector(".name").textContent = newName;
};

onEditCommands.deleteLayer = (id: string, index: number) => {
  let layerElt = ui.layersTreeView.treeRoot.querySelector(`[data-id="${id}"]`);
  ui.layersTreeView.remove(layerElt);

  if (id === tileSetArea.selectedLayerId) {
    index = Math.max(0, index - 1);
    tileSetArea.selectedLayerId = data.tileMapUpdater.tileMapAsset.pub.layers[index].id;
    ui.layersTreeView.clearSelection();
    ui.layersTreeView.addToSelection(ui.layersTreeView.treeRoot.querySelector(`li[data-id="${tileSetArea.selectedLayerId}"]`));
  }

  let pub = data.tileMapUpdater.tileMapAsset.pub;
  let layer = data.tileMapUpdater.tileMapAsset.layers.byId[tileSetArea.selectedLayerId];
  let z = (pub.layers.indexOf(layer) + 0.5) * pub.layerDepthOffset;
  mapArea.patternActor.setLocalPosition(new SupEngine.THREE.Vector3(0, 0, z));

  refreshLayersId();
};

onEditCommands.moveLayer = (id: string, newIndex: number) => {
  let pub = data.tileMapUpdater.tileMapAsset.pub;

  let layerElt = ui.layersTreeView.treeRoot.querySelector(`[data-id="${id}"]`);
  ui.layersTreeView.insertAt(layerElt, "item", pub.layers.length - newIndex);

  let layer = data.tileMapUpdater.tileMapAsset.layers.byId[tileSetArea.selectedLayerId];
  let z = (pub.layers.indexOf(layer) + 0.5) * pub.layerDepthOffset;
  mapArea.patternActor.setLocalPosition(new SupEngine.THREE.Vector3(0, 0, z));

  refreshLayersId();
};

// Tile Set
function onTileSetAssetReceived() {
  let tileMapPub = data.tileMapUpdater.tileMapAsset.pub;
  let tileSetPub = data.tileMapUpdater.tileSetAsset.pub;

  mapArea.cameraControls.setMultiplier(tileMapPub.pixelsPerUnit / tileSetPub.grid.width / 1);
  mapArea.gridRenderer.setRatio({ x: tileMapPub.pixelsPerUnit / tileSetPub.grid.width, y: tileMapPub.pixelsPerUnit / tileSetPub.grid.height });

  if (tileSetPub.texture != null) {
    mapArea.patternRenderer.setTileSet(new TileSet(tileSetPub));
    if (ui.brushToolButton.checked) selectBrushTool(0, 0);
  }
  mapArea.patternBackgroundRenderer.setup(0x900090, 1 / tileMapPub.pixelsPerUnit, tileSetPub.grid.width);
};

onTileSetEditCommands.upload = () => {
  mapArea.patternRenderer.setTileSet(new TileSet(data.tileMapUpdater.tileSetAsset.pub));
  if (ui.brushToolButton.checked) selectBrushTool(0, 0);
};

onTileSetEditCommands.setProperty = () => {
  let tileMapPub = data.tileMapUpdater.tileMapAsset.pub;
  let tileSetPub = data.tileMapUpdater.tileSetAsset.pub;

  mapArea.cameraControls.setMultiplier(tileMapPub.pixelsPerUnit / tileSetPub.grid.width / 1);
  mapArea.gridRenderer.setRatio({ x: tileMapPub.pixelsPerUnit / tileSetPub.grid.width, y: tileMapPub.pixelsPerUnit / tileSetPub.grid.height });
  if (tileSetPub.texture != null) mapArea.patternRenderer.setTileSet(new TileSet(tileSetPub));
  mapArea.patternBackgroundRenderer.setup(0x900090, 1 / tileMapPub.pixelsPerUnit, tileSetPub.grid.width);

  if (ui.brushToolButton.checked) selectBrushTool(0, 0);
};
