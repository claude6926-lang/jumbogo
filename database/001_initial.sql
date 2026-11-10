-- PostgreSQL starting schema for the implemented local domain.
-- This is not yet connected to the SQLite repository and is not the complete TOR model.
BEGIN;
CREATE TABLE app_user (id uuid PRIMARY KEY, name text NOT NULL, phone text UNIQUE NOT NULL, role text NOT NULL CHECK(role IN ('user','driver','admin')), phone_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE vehicle_type (id text PRIMARY KEY, name_th text NOT NULL, name_en text NOT NULL, base_fare_minor bigint NOT NULL CHECK(base_fare_minor>=0), distance_rate_minor bigint NOT NULL CHECK(distance_rate_minor>=0), config jsonb NOT NULL DEFAULT '{}');
CREATE TABLE shipment (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id), driver_id uuid REFERENCES app_user(id), vehicle_type_id text NOT NULL REFERENCES vehicle_type(id), status text NOT NULL CHECK(status IN ('CREATED','SEARCHING','ACCEPTED','ARRIVING','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DROPOFF','COMPLETED','CANCELLED','FAILED')), estimate_minor bigint NOT NULL, credit_minor bigint NOT NULL DEFAULT 0, note text, scheduled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX shipment_user ON shipment(user_id,created_at DESC);
CREATE UNIQUE INDEX one_active_driver_job ON shipment(driver_id) WHERE driver_id IS NOT NULL AND status NOT IN ('COMPLETED','CANCELLED','FAILED');
CREATE TABLE shipment_stop (id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipment(id), position integer NOT NULL, address text NOT NULL, latitude numeric(9,6), longitude numeric(9,6), UNIQUE(shipment_id,position));
CREATE TABLE shipment_status_history (id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipment(id), previous_status text, next_status text NOT NULL, actor_id uuid NOT NULL REFERENCES app_user(id), reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE campaign (id uuid PRIMARY KEY, code text UNIQUE NOT NULL, credit_minor bigint NOT NULL, active boolean NOT NULL DEFAULT false, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, config jsonb NOT NULL DEFAULT '{}');
CREATE TABLE welcome_grant (id uuid PRIMARY KEY, user_id uuid UNIQUE NOT NULL REFERENCES app_user(id), campaign_id uuid NOT NULL REFERENCES campaign(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE wallet_transaction (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id), shipment_id uuid REFERENCES shipment(id), amount_minor bigint NOT NULL, currency char(3) NOT NULL DEFAULT 'THB', kind text NOT NULL, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX wallet_user ON wallet_transaction(user_id,created_at);
CREATE TABLE chat_message (id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipment(id), sender_id uuid NOT NULL REFERENCES app_user(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX chat_shipment ON chat_message(shipment_id,created_at);
CREATE TABLE support_ticket (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id), subject text NOT NULL, status text NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_log (id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES app_user(id), action text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable financial/audit record'; END $$;
CREATE TRIGGER wallet_immutable BEFORE UPDATE OR DELETE ON wallet_transaction FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_mutation();
COMMIT;
