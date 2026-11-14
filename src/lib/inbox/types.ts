/** A SCATT file sent from the phone and waiting in the shooter's inbox. */
export interface InboxItem {
  id: string;
  /** Object path in the private `inbox` bucket. */
  path: string;
  name: string;
  createdAt: string;
}
