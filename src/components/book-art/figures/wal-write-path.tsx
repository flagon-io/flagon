import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** The write path: an UPDATE dirties a page and appends a WAL record; COMMIT waits only for the WAL flush. */
export function WalWritePath({ id, caption }: FigureProps) {
  const sesX = 30;
  const memX = 196;
  const diskX = 456;
  const colW = { ses: 120, mem: 176, disk: 154 };
  const upY = 70;
  const pageY = 70;
  const walY = 168;
  const comY = 230;
  const h = 40;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 318"
      label="An UPDATE changes the page in shared_buffers, marking it dirty, and appends a WAL record to wal_buffers. The dirty page is written to the data files later by the checkpointer or background writer. COMMIT writes and fsyncs the WAL record to a sequential segment in pg_wal and waits until that flush returns."
      caption={caption}
    >
      {/* columns */}
      <Text x={sesX} y={30} caps size={11}>your session</Text>
      <Text x={memX} y={30} caps size={11}>shared memory</Text>
      <Text x={diskX} y={30} caps size={11}>disk</Text>

      {/* UPDATE */}
      <Rect x={sesX} y={upY} w={colW.ses} h={h} tone="shade-2" ink="ink" />
      <Text x={sesX + 12} y={upY + 25} mono size={11}>UPDATE ...</Text>

      {/* the page, and its slow road to the data files */}
      <Rect x={memX} y={pageY} w={colW.mem} h={h} tone="shade" ink="ink" />
      <Text x={memX + 12} y={pageY + 17} mono size={10.5}>page in shared_buffers</Text>
      <Text x={memX + 12} y={pageY + 32} caps size={9.5} ink="line">dirty</Text>
      <Path d={`M${sesX + colW.ses},${upY + 14} L${memX - 2},${pageY + 14}`} ink="ink" arrow fig={id} />

      <Rect x={diskX} y={pageY} w={colW.disk} h={h} tone="paper" ink="ink" />
      <Text x={diskX + 12} y={pageY + 25} mono size={10.5}>data files</Text>
      <Path d={`M${memX + colW.mem},${pageY + 20} L${diskX - 2},${pageY + 20}`} ink="line" dashed arrow fig={id} />
      <Text x={diskX} y={pageY + h + 18} size={10} ink="line">written later, by the</Text>
      <Text x={diskX} y={pageY + h + 32} size={10} ink="line">checkpointer or bgwriter</Text>

      {/* the WAL record */}
      <Rect x={memX} y={walY} w={colW.mem} h={h} tone="shade" ink="ink" />
      <Text x={memX + 12} y={walY + 17} mono size={10.5}>WAL record</Text>
      <Text x={memX + 12} y={walY + 32} size={10} ink="line">in wal_buffers</Text>
      <Path d={`M${sesX + colW.ses},${upY + 28} L${sesX + colW.ses + 14},${upY + 28} L${sesX + colW.ses + 14},${walY + 20} L${memX - 2},${walY + 20}`} ink="ink" arrow fig={id} />

      {/* COMMIT: write + fsync, and wait */}
      <Rect x={sesX} y={comY} w={colW.ses} h={h} tone="accent" ink="accent" width={1.4} />
      <Text x={sesX + 12} y={comY + 25} mono size={11} ink="accent" weight={600}>COMMIT</Text>
      <Path d={`M${sesX + colW.ses},${comY + 14} L${memX + 140},${comY + 14} L${memX + 140},${walY + h + 2}`} ink="accent" width={1.4} arrow fig={id} />
      <Path d={`M${memX + colW.mem},${walY + 20} L${diskX - 2},${walY + 20}`} ink="accent" width={1.4} arrow fig={id} />
      <Text x={memX + colW.mem + 8} y={walY + 12} size={10} ink="accent">write + fsync</Text>

      <Rect x={diskX} y={walY} w={colW.disk} h={h} tone="accent" ink="accent" width={1.4} />
      <Text x={diskX + 12} y={walY + 17} mono size={10.5} ink="accent">pg_wal/ segment</Text>
      <Text x={diskX + 12} y={walY + 32} size={10} ink="accent">sequential</Text>

      {/* the wait */}
      <Path d={`M${diskX + 40},${walY + h} L${diskX + 40},${comY + 30} L${sesX + colW.ses + 2},${comY + 30}`} ink="accent" dashed arrow fig={id} />
      <Text x={sesX} y={comY + h + 20} size={10.5} ink="accent">waits here until</Text>
      <Text x={sesX} y={comY + h + 34} size={10.5} ink="accent">the flush returns</Text>
    </Figure>
  );
}
