using System;
using System.Collections.Generic;

namespace AirplaneCheck
{
	public interface IAirplaneDataService
	{
		IReadOnlyList<AirplaneInfo> AirplaneInfos { get; }
		void RefreshCache();
		void ClearCache();
		AirplaneInfo GetAirplaneInfo (int id);
		void SaveAirplaneInfo (AirplaneInfo ai);
		void DeleteAirplaneInfo (AirplaneInfo ai);
	}
}

