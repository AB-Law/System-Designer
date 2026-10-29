import { featureOn } from "../../shell/registry";
import { Tabs } from "../../ui/Tabs";
import { DeckDetail } from "./components/DeckDetail";
import { DeckList } from "./components/DeckList";
import { MapList } from "./components/MapList";
import { MapView } from "./components/MapView";
import { ReviewSession } from "./components/ReviewSession";
import { go, parse, tabOf } from "./route";
import "./study.css";

export default function Screen({ rest }: { rest: string }) {
  const route = parse(rest);
  const mapsOn = featureOn("study.maps");
  const tabs = [{ id: "decks", label: "Decks" }, { id: "due", label: "Review" }, ...(mapsOn ? [{ id: "maps", label: "Mind maps" }] : [])];

  return (
    <div className="st-module">
      <h1 className="st-title">Study</h1>
      <p className="module-lede">Flashcards with spaced repetition, and mind maps for concepts.</p>
      <Tabs
        label="Study sections"
        tabs={tabs}
        active={tabOf(route)}
        onChange={(id) => go(id === "due" ? { name: "due" } : id === "maps" ? { name: "maps" } : { name: "decks" })}
      />
      <div className="st-body">
        {route.name === "decks" && <DeckList />}
        {route.name === "deck" && <DeckDetail key={route.deckId} deckId={route.deckId} />}
        {route.name === "due" && <ReviewSession deckId={null} />}
        {route.name === "review" && <ReviewSession key={route.deckId ?? "all"} deckId={route.deckId} />}
        {mapsOn && route.name === "maps" && <MapList />}
        {mapsOn && route.name === "map" && <MapView key={route.mapId} mapId={route.mapId} />}
      </div>
    </div>
  );
}
