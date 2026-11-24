// A placeholder, in the shape a translated gameplay file takes. Replace it with one file per upstream file.
//
// Upstream (UdonSharp):                              Here:
//   [UdonSynced] public int count;                     static synced = ["count"]; count = 0;
//   public override void Interact()                    override Interact(): void
//   Networking.SetOwner(Networking.LocalPlayer, gameObject)   this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject)
//   RequestSerialization();                            this.RequestSerialization();
//   public override void OnDeserialization()           override OnDeserialization(): void

import { Behaviour, type TextRef } from "../portkit/src/index.ts";

export class Counter extends Behaviour {
  static override synced = ["count"];
  count = 0;

  // From bindings.json.
  label!: TextRef;

  override Start(): void {
    this.Refresh();
  }

  override Interact(): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.count++;
    this.RequestSerialization();
    this.Refresh();
  }

  override OnDeserialization(): void {
    this.Refresh();
  }

  private Refresh(): void {
    this.label.text = String(this.count);
  }
}
