#!/usr/bin/env python3
"""Заливка синтетических DICOM в локальный dcm4chee через STOW-RS.

Данные генерируются целиком на месте (pydicom + numpy), без внешних загрузок:
несколько пациентов (в т.ч. с кириллицей в ФИО — проверка charset в поиске),
модальности CT/MR/US, исследования разных дат, многосрезовые серии для вьюера.

    python3 docker/seed.py [--url http://localhost:8080/dcm4chee-arc] [--aet DCM4CHEE]
"""

import argparse
import datetime as dt
import io
import random
import sys
import urllib.request
import uuid

import numpy as np
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import (
    CTImageStorage,
    MRImageStorage,
    UltrasoundImageStorage,
    ExplicitVRLittleEndian,
    generate_uid,
)

SOP_CLASSES = {
    "CT": CTImageStorage,
    "MR": MRImageStorage,
    "US": UltrasoundImageStorage,
}

# (ФИО, PatientID, дата рождения, пол)
PATIENTS = [
    ("Иванов^Иван^Иванович", "P-1001", "19640312", "M"),
    ("Петрова^Мария^Сергеевна", "P-1002", "19780925", "F"),
    ("Сидоров^Алексей", "P-1003", "19901104", "M"),
    ("Smith^John^A", "P-2001", "19551230", "M"),
    ("Müller^Anna", "P-2002", "19830417", "F"),
    ("Кузнецова^Ольга^Павловна", "P-1004", "20010708", "F"),
]

STUDY_TEMPLATES = [
    ("CT", "КТ органов грудной клетки", ["Topogram", "Chest 1.0mm", "Chest 5.0mm"]),
    ("CT", "КТ головного мозга без контраста", ["Head 5.0mm"]),
    ("MR", "МРТ поясничного отдела позвоночника", ["T2 sag", "T1 sag", "T2 ax"]),
    ("MR", "MRI Brain", ["FLAIR ax", "DWI"]),
    ("US", "УЗИ брюшной полости", ["Abdomen"]),
]


def phantom(rows: int, cols: int, slice_idx: int, n_slices: int, rng) -> np.ndarray:
    """Простой фантом: тело-эллипс с включениями, меняющимися по срезам."""
    y, x = np.mgrid[0:rows, 0:cols]
    cy, cx = rows / 2, cols / 2
    t = slice_idx / max(n_slices - 1, 1)

    img = np.full((rows, cols), -1000.0)  # воздух
    body = ((x - cx) / (cols * 0.42)) ** 2 + ((y - cy) / (rows * 0.34)) ** 2 <= 1
    img[body] = -60 + 40 * np.sin(3 * t * np.pi)  # мягкие ткани

    # два "органа", плывущих по срезам
    for k, hu in ((0, 55), (1, 120)):
        ox = cx + (0.18 * cols) * (1 if k else -1)
        oy = cy + (0.12 * rows) * np.sin(2 * np.pi * t + k)
        r = (0.10 + 0.04 * np.sin(np.pi * t + k)) * cols
        img[((x - ox) ** 2 + (y - oy) ** 2) <= r**2] = hu

    # "кость" — кольцо
    ring = ((x - cx) / (cols * 0.44)) ** 2 + ((y - cy) / (rows * 0.36)) ** 2
    img[(ring > 0.88) & (ring <= 1.0)] = 900

    img += rng.normal(0, 12, img.shape)
    return np.clip(img, -1024, 3071).astype(np.int16)


def make_instance(*, patient, study, series, modality, rows, cols, idx, n_slices, rng) -> Dataset:
    name, pid, birth, sex = patient
    study_uid, study_date, study_time, accession, study_desc = study
    series_uid, series_no, series_desc = series

    sop_uid = generate_uid()
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.MediaStorageSOPClassUID = SOP_CLASSES[modality]
    ds.file_meta.MediaStorageSOPInstanceUID = sop_uid
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.ImplementationClassUID = generate_uid()

    ds.SpecificCharacterSet = "ISO_IR 192"  # UTF-8
    ds.SOPClassUID = SOP_CLASSES[modality]
    ds.SOPInstanceUID = sop_uid

    ds.PatientName = name
    ds.PatientID = pid
    ds.PatientBirthDate = birth
    ds.PatientSex = sex

    ds.StudyInstanceUID = study_uid
    ds.StudyDate = study_date
    ds.StudyTime = study_time
    ds.AccessionNumber = accession
    ds.StudyDescription = study_desc
    ds.StudyID = accession[-5:]
    ds.ReferringPhysicianName = "Врач^Направивший"
    ds.InstitutionName = "Тестовая клиника"

    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = series_no
    ds.SeriesDescription = series_desc
    ds.SeriesDate = study_date
    ds.SeriesTime = study_time
    ds.Modality = modality
    ds.BodyPartExamined = "CHEST" if "Chest" in series_desc or "грудной" in study_desc else "HEAD"

    ds.InstanceNumber = idx + 1
    ds.ImagePositionPatient = [-120.0, -120.0, float(idx) * 5.0]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.SliceLocation = float(idx) * 5.0
    ds.SliceThickness = 5.0
    ds.PixelSpacing = [0.6, 0.6]
    ds.FrameOfReferenceUID = generate_uid()

    pixels = phantom(rows, cols, idx, n_slices, rng)
    if modality == "US":
        # УЗИ — 8-битное без rescale
        u8 = ((pixels.astype(np.float32) + 1024) / 4095 * 255).astype(np.uint8)
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 8
        ds.BitsStored = 8
        ds.HighBit = 7
        ds.PixelRepresentation = 0
        ds.PixelData = u8.tobytes()
    else:
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleIntercept = 0.0
        ds.RescaleSlope = 1.0
        ds.WindowCenter = 40.0
        ds.WindowWidth = 400.0
        ds.PixelData = pixels.tobytes()

    ds.Rows = rows
    ds.Columns = cols
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    return ds


def stow(url: str, aet: str, datasets: list[Dataset]) -> tuple[int, str]:
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    for ds in datasets:
        buf = io.BytesIO()
        ds.save_as(buf, enforce_file_format=True)
        body.write(f"\r\n--{boundary}\r\n".encode())
        body.write(b"Content-Type: application/dicom\r\n\r\n")
        body.write(buf.getvalue())
    body.write(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{url}/aets/{aet}/rs/studies",
        data=body.getvalue(),
        method="POST",
        headers={
            "Content-Type": f'multipart/related; type="application/dicom"; boundary={boundary}',
            "Accept": "application/dicom+json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")[:200]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8080/dcm4chee-arc")
    ap.add_argument("--aet", default="DCM4CHEE")
    ap.add_argument("--studies", type=int, default=12, help="сколько исследований создать")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    rnd = random.Random(args.seed)
    today = dt.date.today()

    total_instances = 0
    for i in range(args.studies):
        patient = PATIENTS[i % len(PATIENTS)]
        modality, study_desc, series_descs = STUDY_TEMPLATES[i % len(STUDY_TEMPLATES)]
        day = today - dt.timedelta(days=rnd.choice([0, 0, 1, 3, 6, 14, 27, 60, 180]))
        study = (
            generate_uid(),
            day.strftime("%Y%m%d"),
            f"{rnd.randint(8, 19):02d}{rnd.randint(0, 59):02d}{rnd.randint(0, 59):02d}",
            f"ACC{20000 + i}",
            study_desc,
        )

        datasets = []
        for s_idx, series_desc in enumerate(series_descs):
            n = 1 if "Topogram" in series_desc else (8 if modality == "US" else rnd.choice([24, 32, 48]))
            rows = cols = 128 if modality != "US" else 96
            series = (generate_uid(), s_idx + 1, series_desc)
            for k in range(n):
                datasets.append(
                    make_instance(
                        patient=patient, study=study, series=series, modality=modality,
                        rows=rows, cols=cols, idx=k, n_slices=n, rng=rng,
                    )
                )

        status, snippet = stow(args.url, args.aet, datasets)
        total_instances += len(datasets)
        print(f"[{i + 1}/{args.studies}] {patient[0]:34} {modality} {study[4][:38]:38} "
              f"{len(datasets):3} снимков -> HTTP {status}")

    print(f"\nГотово: {args.studies} исследований, {total_instances} снимков.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
